const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');

process.env.SAMSAR_API_KEY = 'test-service-key';
process.env.GALLERY_VIEWER_SALT = 'test-viewer-salt';

const capturedEvents = [];

global.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;

  if (url.includes('/users/verify_token')) {
    assert.match(url, /authToken=valid-test-token/);
    return Response.json({ _id: 'logged-in-user-123' });
  }

  if (url.includes('/v2/gallery/events/view')) {
    capturedEvents.push(JSON.parse(init.body));
    return Response.json(
      { recorded: true, countedView: true, stats: { views: 42 } },
      { status: 202 }
    );
  }

  throw new Error(`Unexpected request: ${url}`);
};

const { POST } = require('../.next/server/app/api/gallery/view/route.js')
  .routeModule.userland;

const makeRequest = (headers = {}) => new NextRequest(
  'http://localhost/api/gallery/view',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ publicationId: 'publication-123', eventType: 'view' })
  }
);

const verify = async () => {
  const firstAnonymous = await POST(makeRequest());
  assert.equal(firstAnonymous.status, 202);
  const visitorCookie = firstAnonymous.headers.get('set-cookie')?.split(';', 1)[0];
  assert.match(visitorCookie ?? '', /^samsarGalleryVisitor=/);

  const secondAnonymous = await POST(makeRequest({ cookie: visitorCookie }));
  assert.equal(secondAnonymous.status, 202);

  const authHeaders = { authorization: 'Bearer valid-test-token' };
  const firstAuthenticated = await POST(makeRequest(authHeaders));
  const secondAuthenticated = await POST(makeRequest(authHeaders));
  assert.equal(firstAuthenticated.status, 202);
  assert.equal(secondAuthenticated.status, 202);

  assert.equal(capturedEvents.length, 4);
  assert.equal(
    capturedEvents[0].viewer_id,
    capturedEvents[1].viewer_id,
    'anonymous visitor ID should persist'
  );
  assert.equal(
    capturedEvents[2].viewer_id,
    capturedEvents[3].viewer_id,
    'logged-in viewer ID should persist'
  );
  assert.notEqual(
    capturedEvents[0].viewer_id,
    capturedEvents[2].viewer_id,
    'anonymous and logged-in viewer IDs should differ'
  );

  console.log('Gallery view route verification passed.');
};

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
