import React from 'react';
import type { Metadata } from 'next';
import { ProfilePage } from '@/pages/ProfilePage';
import { getSiteUrl } from '@/lib/siteConfig';

const siteUrl = getSiteUrl();

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return {
    title: `Hồ Sơ Tác Giả #${params.id} | WaveLink`,
    description: 'Trang thông tin tác giả và danh sách audio đã chia sẻ trên WaveLink.',
    alternates: {
      canonical: `${siteUrl}/profile/${params.id}`,
    },
  };
}

export default function ProfileUserRoutePage() {
  return <ProfilePage />;
}
