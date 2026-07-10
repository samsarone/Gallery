import type { Metadata } from 'next';
import AdminGallery from '@/components/AdminGallery';

export const metadata: Metadata = {
  title: 'Gallery Admin | Samsar',
  description: 'Manage published Samsar gallery videos.'
};

export default function AdminPage() {
  return (
    <main className="admin-page">
      <AdminGallery />
    </main>
  );
}
