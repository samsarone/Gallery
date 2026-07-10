/* eslint-disable jsx-a11y/media-has-caption */
'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { PublishedVideo } from '@/lib/types';
import {
  formatCompactNumber,
  formatPublishedDate,
  isPortraitVideo,
  parseVideoCollection
} from '@/lib/videos';

type FormMode = 'create' | 'edit';

interface PublicationFormState {
  sessionId: string;
  title: string;
  description: string;
  creatorHandle: string;
  tags: string;
  aspectRatio: string;
  splashImage: string;
  originalPrompt: string;
}

const EMPTY_FORM: PublicationFormState = {
  sessionId: '',
  title: '',
  description: '',
  creatorHandle: '',
  tags: '',
  aspectRatio: '16:9',
  splashImage: '',
  originalPrompt: ''
};

const openLogin = () => {
  window.dispatchEvent(
    new CustomEvent('samsar:open-auth', { detail: { view: 'login' } })
  );
};

const formFromVideo = (video: PublishedVideo): PublicationFormState => ({
  sessionId: video.sessionId ?? '',
  title: video.title,
  description: video.description,
  creatorHandle: video.creatorHandle ?? '',
  tags: (video.tags ?? []).join(', '),
  aspectRatio: video.aspectRatio ?? (isPortraitVideo(video) ? '9:16' : '16:9'),
  splashImage: video.posterUrl ?? '',
  originalPrompt: video.originalPrompt ?? ''
});

const errorFromPayload = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== 'object') return fallback;
  const error = (payload as Record<string, unknown>).error;
  return typeof error === 'string' ? error : fallback;
};

export default function AdminGallery() {
  const [videos, setVideos] = useState<PublishedVideo[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessStatus, setAccessStatus] = useState<'allowed' | 'unauthenticated' | 'forbidden'>('allowed');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [form, setForm] = useState<PublicationFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PublishedVideo | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPublications = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/admin/videos?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (response.status === 401) {
        setAccessStatus('unauthenticated');
        setVideos([]);
        return;
      }
      if (response.status === 403) {
        setAccessStatus('forbidden');
        setVideos([]);
        setError(errorFromPayload(payload, 'Administrator access is required.'));
        return;
      }
      if (!response.ok) {
        throw new Error(errorFromPayload(payload, 'Unable to load publications.'));
      }
      setAccessStatus('allowed');
      const parsed = parseVideoCollection(payload);
      setVideos((current) => {
        if (!cursor) return parsed.items;
        const map = new Map(current.map((video) => [video.id, video]));
        parsed.items.forEach((video) => map.set(video.id, video));
        return Array.from(map.values());
      });
      setNextCursor(parsed.nextCursor);
      setHasMore(parsed.hasMore);
      setTotalCount(parsed.totalCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load publications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPublications();

    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('oauth_channel');
    const handleAuth = () => void loadPublications();
    channel.addEventListener('message', handleAuth);
    return () => {
      channel.removeEventListener('message', handleAuth);
      channel.close();
    };
  }, [loadPublications]);

  useEffect(() => {
    if (!formMode && !pendingDelete) return;
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, [formMode, pendingDelete]);

  const filteredVideos = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return videos;
    return videos.filter((video) =>
      [video.title, video.creatorHandle, video.sessionId, ...(video.tags ?? [])]
        .some(
          (value) => typeof value === 'string' && value.toLowerCase().includes(normalized)
        )
    );
  }, [query, videos]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingVideoId(null);
    setFormMode('create');
    setError(null);
  };

  const openEdit = (video: PublishedVideo) => {
    setForm(formFromVideo(video));
    setEditingVideoId(video.id);
    setFormMode('edit');
    setError(null);
  };

  const closeForm = () => {
    if (saving) return;
    setFormMode(null);
    setEditingVideoId(null);
    setForm(EMPTY_FORM);
  };

  const updateForm = (field: keyof PublicationFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.sessionId.trim()) {
      setError('A video session ID is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/videos', {
        method: formMode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          sessionId: form.sessionId.trim(),
          tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(errorFromPayload(payload, 'Unable to save this publication.'));
      }

      setNotice(formMode === 'create' ? 'Video published to the gallery.' : 'Publication updated.');
      setFormMode(null);
      setEditingVideoId(null);
      setForm(EMPTY_FORM);
      await loadPublications();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this publication.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete?.sessionId) {
      setError('This publication has no session ID and cannot be removed here.');
      setPendingDelete(null);
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/videos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: pendingDelete.sessionId })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(errorFromPayload(payload, 'Unable to delete this publication.'));
      }
      setNotice('Publication removed from the gallery.');
      setPendingDelete(null);
      await loadPublications();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete this publication.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading && videos.length === 0) {
    return <div className="admin-loading"><span /><p>Opening gallery studio…</p></div>;
  }

  if (accessStatus !== 'allowed') {
    return (
      <section className="admin-access">
        <span className="admin-access__mark">S</span>
        <span className="admin-access__eyebrow">Gallery studio</span>
        <h1>{accessStatus === 'unauthenticated' ? 'Sign in to continue' : 'Administrator access required'}</h1>
        <p>
          {accessStatus === 'unauthenticated'
            ? 'Use an administrator account to manage the public video library.'
            : error ?? 'Your account does not have permission to manage the gallery.'}
        </p>
        {accessStatus === 'unauthenticated' ? (
          <button onClick={openLogin} type="button">Sign in</button>
        ) : (
          <a href="/">Return to gallery</a>
        )}
      </section>
    );
  }

  return (
    <>
      <header className="admin-header">
        <div>
          <span>Gallery studio</span>
          <h1>Published videos</h1>
          <p>Curate every video visitors discover on the Samsar Gallery.</p>
        </div>
        <button className="admin-primary-button" onClick={openCreate} type="button">
          <span aria-hidden="true">＋</span> Add publication
        </button>
      </header>

      <section className="admin-overview" aria-label="Gallery overview">
        <div><strong>{totalCount ?? videos.length}</strong><span>Published videos</span></div>
        <div><strong>{videos.filter(isPortraitVideo).length}</strong><span>9:16 videos</span></div>
        <div><strong>{videos.filter((video) => !isPortraitVideo(video)).length}</strong><span>16:9 videos</span></div>
        <label className="admin-search">
          <span aria-hidden="true">⌕</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search publications"
            type="search"
            value={query}
          />
        </label>
      </section>

      {notice && (
        <div className="admin-notice" role="status">
          <span>✓</span>{notice}
          <button aria-label="Dismiss" onClick={() => setNotice(null)} type="button">×</button>
        </div>
      )}
      {error && <div className="admin-error" role="alert">{error}</div>}

      <section className="admin-list" aria-label="Published video list">
        <div className="admin-list__header">
          <span>Video</span><span>Format</span><span>Engagement</span><span>Published</span><span>Actions</span>
        </div>
        {filteredVideos.map((video) => (
          <article className="admin-row" key={video.id}>
            <div className="admin-video-summary">
              <div className={`admin-video-summary__media${isPortraitVideo(video) ? ' is-portrait' : ''}`}>
                <video muted playsInline poster={video.posterUrl} preload="metadata" src={video.videoUrl} />
              </div>
              <div>
                <strong>{video.title}</strong>
                <span>{video.creatorHandle ? `@${video.creatorHandle}` : 'No creator handle'}</span>
                <small title={video.sessionId ?? undefined}>Session {video.sessionId ?? 'unavailable'}</small>
              </div>
            </div>
            <span className={`admin-format ${isPortraitVideo(video) ? 'is-short' : ''}`}>
              {isPortraitVideo(video) ? '9:16' : '16:9'}
            </span>
            <div className="admin-engagement">
              <span>▶ {formatCompactNumber(video.stats.views)}</span>
              <span>♥ {formatCompactNumber(video.stats.likes)}</span>
              <span>◯ {formatCompactNumber(video.stats.comments)}</span>
            </div>
            <span className="admin-date">{formatPublishedDate(video.createdAt)}</span>
            <div className="admin-row__actions">
              <a href={`/video/${encodeURIComponent(video.id)}`} target="_blank" rel="noreferrer">View</a>
              <button onClick={() => openEdit(video)} type="button">Edit</button>
              <button className="is-danger" onClick={() => { setError(null); setPendingDelete(video); }} type="button">Delete</button>
            </div>
          </article>
        ))}
        {filteredVideos.length === 0 && (
          <div className="admin-list__empty">
            <h2>{query ? 'No matching publications' : 'No published videos'}</h2>
            <p>{query ? 'Try another title, creator, or session ID.' : 'Add the first video to the public gallery.'}</p>
          </div>
        )}
      </section>

      {hasMore && !query && (
        <button
          className="admin-load-more"
          disabled={loading}
          onClick={() => void loadPublications(nextCursor)}
          type="button"
        >
          {loading ? 'Loading…' : 'Load more publications'}
        </button>
      )}

      {formMode && (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="publication-form-title">
          <button className="admin-modal__backdrop" onClick={closeForm} type="button" aria-label="Close form" />
          <form className="admin-form" onSubmit={handleSubmit}>
            <header>
              <div>
                <span>{formMode === 'create' ? 'New publication' : 'Edit publication'}</span>
                <h2 id="publication-form-title">{formMode === 'create' ? 'Add a video' : form.title}</h2>
              </div>
              <button aria-label="Close" onClick={closeForm} type="button">×</button>
            </header>
            <p className="admin-form__intro">
              {formMode === 'create'
                ? 'Publish a completed Samsar session to the public gallery.'
                : 'Update how this video appears across the gallery.'}
            </p>
            <div className="admin-form__grid">
              <label className="admin-form__wide">
                <span>Video session ID <b>*</b></span>
                <input
                  disabled={formMode === 'edit'}
                  onChange={(event) => updateForm('sessionId', event.target.value)}
                  placeholder="Paste a completed session ID"
                  required
                  value={form.sessionId}
                />
                <small>The session must have a completed final video.</small>
              </label>
              <label className="admin-form__wide">
                <span>Title</span>
                <input onChange={(event) => updateForm('title', event.target.value)} placeholder="Video title" value={form.title} />
              </label>
              <label className="admin-form__wide">
                <span>Description</span>
                <textarea onChange={(event) => updateForm('description', event.target.value)} placeholder="A short description for viewers" rows={3} value={form.description} />
              </label>
              <label>
                <span>Creator handle</span>
                <input onChange={(event) => updateForm('creatorHandle', event.target.value)} placeholder="creator" value={form.creatorHandle} />
              </label>
              <label>
                <span>Format</span>
                <select onChange={(event) => updateForm('aspectRatio', event.target.value)} value={form.aspectRatio}>
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                </select>
              </label>
              <label className="admin-form__wide">
                <span>Tags</span>
                <input onChange={(event) => updateForm('tags', event.target.value)} placeholder="cinematic, product, animation" value={form.tags} />
                <small>Separate tags with commas.</small>
              </label>
              <label className="admin-form__wide">
                <span>Poster image URL</span>
                <input onChange={(event) => updateForm('splashImage', event.target.value)} placeholder="https://…" type="url" value={form.splashImage} />
              </label>
              <label className="admin-form__wide">
                <span>Original prompt</span>
                <textarea onChange={(event) => updateForm('originalPrompt', event.target.value)} placeholder="Optional generation prompt" rows={3} value={form.originalPrompt} />
              </label>
            </div>
            {error && <div className="admin-form__error" role="alert">{error}</div>}
            <footer>
              <button className="admin-secondary-button" disabled={saving} onClick={closeForm} type="button">Cancel</button>
              <button className="admin-primary-button" disabled={saving} type="submit">
                {saving ? 'Saving…' : formMode === 'create' ? 'Publish video' : 'Save changes'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {pendingDelete && (
        <div className="admin-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
          <button className="admin-modal__backdrop" onClick={() => !deleting && setPendingDelete(null)} type="button" aria-label="Cancel delete" />
          <div className="delete-dialog">
            <span className="delete-dialog__icon">!</span>
            <h2 id="delete-title">Remove this publication?</h2>
            <p><strong>{pendingDelete.title}</strong> will disappear from the public gallery. The source video session will remain in Samsar.</p>
            {error && <div className="admin-form__error" role="alert">{error}</div>}
            <div>
              <button className="admin-secondary-button" disabled={deleting} onClick={() => setPendingDelete(null)} type="button">Cancel</button>
              <button className="admin-danger-button" disabled={deleting} onClick={() => void handleDelete()} type="button">
                {deleting ? 'Removing…' : 'Remove publication'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
