import React from 'react';

/**
 * Reusable comic-style fallback Skeleton components.
 * Uses CSS semantic tokens for seamless Light Paper & Dark Ink rendering,
 * smooth GPU shimmer, and responsive Tablet/Desktop layouts to avoid CLS.
 */

export const HomeSkeleton: React.FC = () => {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 flex flex-col gap-6 pb-36 md:pb-28 pt-2 fade-in-comic">
      {/* Greeting Banner Skeleton */}
      <div className="manga-bubble flex items-center justify-between animate-pulse">
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <div className="h-3 skeleton-shimmer rounded w-32" />
          <div className="h-4 skeleton-shimmer rounded w-56 max-w-full" />
        </div>
        <div className="w-16 h-6 rounded-md skeleton-shimmer border border-[var(--border-ink)] shrink-0" />
      </div>

      {/* Hero + Recent Listening Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="h-4 skeleton-shimmer rounded w-40" />
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-2.5 rounded-full bg-[#FFE600]/70 border border-[#111113]" />
              <div className="w-2.5 h-2.5 rounded-full skeleton-shimmer" />
              <div className="w-2.5 h-2.5 rounded-full skeleton-shimmer" />
            </div>
          </div>

          <div className="card-comic p-4 flex flex-col gap-3 animate-pulse">
            <div className="flex gap-3.5">
              <div className="w-24 h-28 md:w-28 md:h-32 rounded-xl border-2 border-[var(--border-ink)] skeleton-shimmer shrink-0" />
              <div className="flex flex-col justify-between flex-1 py-0.5 min-w-0">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-14 h-4 skeleton-shimmer rounded" />
                    <div className="w-20 h-4 skeleton-shimmer rounded" />
                  </div>
                  <div className="h-4 skeleton-shimmer rounded w-5/6" />
                  <div className="h-3 skeleton-shimmer rounded w-1/2" />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="h-3 skeleton-shimmer rounded w-16" />
                  <div className="h-3 skeleton-shimmer rounded w-16" />
                </div>
              </div>
            </div>
            <div className="w-full h-2.5 rounded-full skeleton-shimmer border border-[var(--border-ink)]" />
            <div className="flex items-center justify-between pt-2 border-t-2 border-[var(--border-ink)]">
              <div className="w-28 h-8 skeleton-shimmer rounded-lg" />
              <div className="w-24 h-8 bg-[#FFE600]/70 rounded-lg border border-[#111113]" />
            </div>
          </div>
        </section>

        <section className="lg:col-span-5 flex flex-col gap-2.5">
          <div className="h-4 skeleton-shimmer rounded w-36" />
          <div className="flex flex-col gap-2.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="card-comic-sm p-3 flex items-center justify-between gap-3 animate-pulse"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-11 h-11 rounded-lg border-2 border-[var(--border-ink)] skeleton-shimmer shrink-0" />
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="h-3.5 skeleton-shimmer rounded w-3/4" />
                    <div className="h-2.5 skeleton-shimmer rounded w-1/2" />
                  </div>
                </div>
                <div className="w-9 h-9 rounded-lg border-2 border-[var(--border-ink)] skeleton-shimmer shrink-0" />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Category Pills Skeleton */}
      <section className="flex flex-col gap-2">
        <div className="h-4 skeleton-shimmer rounded w-36" />
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="w-20 h-8 rounded-lg skeleton-shimmer border-2 border-[var(--border-ink)] shrink-0 animate-pulse"
            />
          ))}
        </div>
      </section>

      {/* Audio Cards Grid Skeleton */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="w-48 h-9 rounded-xl skeleton-shimmer border-2 border-[var(--border-ink)]" />
          <div className="w-20 h-4 skeleton-shimmer rounded" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col gap-2 animate-pulse">
              <div className="card-comic w-full aspect-[3/4] skeleton-shimmer" />
              <div className="h-3.5 skeleton-shimmer rounded w-full" />
              <div className="h-2.5 skeleton-shimmer rounded w-2/3" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export const LibraryListSkeleton: React.FC = () => {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5"
      id="lib-audio-list-skeleton"
    >
      {[1, 2, 3, 4, 5, 6].map((idx) => (
        <div
          key={idx}
          className="card-comic p-3.5 flex flex-col gap-3 animate-pulse"
        >
          <div className="flex items-start gap-3">
            <div className="w-20 h-24 rounded-lg border-2 border-[var(--border-ink)] skeleton-shimmer shrink-0" />
            <div className="flex flex-col justify-between flex-1 h-24 py-0.5 min-w-0">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-14 h-4 skeleton-shimmer rounded" />
                  <div className="w-10 h-4 skeleton-shimmer rounded" />
                </div>
                <div className="h-4 skeleton-shimmer rounded w-5/6" />
                <div className="h-3 skeleton-shimmer rounded w-1/2" />
              </div>
              <div className="flex justify-between items-center border-t border-[var(--border-ink)]/20 pt-1">
                <div className="h-3 skeleton-shimmer rounded w-16" />
                <div className="h-3 skeleton-shimmer rounded w-16" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-ink)]/30">
            <div className="w-full h-2 rounded-full skeleton-shimmer flex-1" />
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-12 h-7 skeleton-shimmer rounded-md" />
              <div className="w-12 h-7 skeleton-shimmer rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const PlayerSkeleton: React.FC = () => {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 pt-2 fade-in-comic">
      <div className="w-24 h-8 rounded-lg skeleton-shimmer border-2 border-[var(--border-ink)] animate-pulse" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="card-comic p-4 md:p-5 flex flex-col gap-4 animate-pulse">
            <div className="flex gap-3.5">
              <div className="w-24 h-28 md:w-32 md:h-36 rounded-xl border-2 border-[var(--border-ink)] skeleton-shimmer shrink-0" />
              <div className="flex flex-col justify-between flex-1 py-1 min-w-0">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-14 h-4 skeleton-shimmer rounded" />
                    <div className="w-12 h-4 skeleton-shimmer rounded" />
                  </div>
                  <div className="h-5 skeleton-shimmer rounded w-5/6" />
                  <div className="h-3.5 skeleton-shimmer rounded w-1/2" />
                </div>
                <div className="h-3 skeleton-shimmer rounded w-28" />
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-3 border-t-2 border-[var(--border-ink)]">
              <div className="h-3 skeleton-shimmer rounded-full w-full" />
              <div className="flex justify-between items-center">
                <div className="h-3 skeleton-shimmer rounded w-12" />
                <div className="h-3 skeleton-shimmer rounded w-12" />
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2 border-t-2 border-[var(--border-ink)]">
              <div className="w-9 h-9 rounded-full skeleton-shimmer border border-[var(--border-ink)]" />
              <div className="w-10 h-10 rounded-full skeleton-shimmer border border-[var(--border-ink)]" />
              <div className="w-14 h-14 rounded-full skeleton-shimmer border-2 border-[var(--border-ink)]" />
              <div className="w-10 h-10 rounded-full skeleton-shimmer border border-[var(--border-ink)]" />
              <div className="w-9 h-9 rounded-full skeleton-shimmer border border-[var(--border-ink)]" />
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="card-comic p-3.5 flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded skeleton-shimmer" />
              <div className="h-4 skeleton-shimmer rounded w-36" />
            </div>
            <div className="w-16 h-5 rounded skeleton-shimmer" />
          </div>

          <div className="card-comic p-4 flex flex-col gap-3 animate-pulse">
            <div className="flex items-center justify-between pb-2 border-b-2 border-[var(--border-ink)]">
              <div className="h-4 skeleton-shimmer rounded w-32" />
              <div className="h-3.5 skeleton-shimmer rounded w-16" />
            </div>
            <div className="flex flex-col gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="card-comic-sm p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5 flex-1">
                    <div className="w-8 h-8 rounded skeleton-shimmer shrink-0" />
                    <div className="flex flex-col gap-1.5 flex-1">
                      <div className="h-3.5 skeleton-shimmer rounded w-2/3" />
                      <div className="h-2.5 skeleton-shimmer rounded w-1/3" />
                    </div>
                  </div>
                  <div className="w-12 h-6 skeleton-shimmer rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const NotificationsSkeleton: React.FC = () => {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 pt-2 fade-in-comic">
      <div className="card-comic p-4 bg-[#FFE600]/80 text-[#111113] flex flex-col gap-2.5 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl border-2 border-[#111113] bg-white/80 shrink-0" />
            <div className="flex flex-col gap-1.5">
              <div className="h-5 bg-black/20 rounded w-36" />
              <div className="h-3 bg-black/15 rounded w-48" />
            </div>
          </div>
          <div className="w-14 h-5 rounded bg-black/20" />
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-black/20">
          <div className="h-8 bg-white/80 rounded-lg border border-[#111113]" />
          <div className="h-8 bg-white/80 rounded-lg border border-[#111113]" />
        </div>
      </div>

      <div className="card-comic p-4 flex flex-col gap-3 animate-pulse">
        <div className="flex items-center justify-between pb-2 border-b-2 border-[var(--border-ink)]">
          <div className="h-4 skeleton-shimmer rounded w-36" />
          <div className="h-3.5 skeleton-shimmer rounded w-16" />
        </div>
        <div className="flex flex-col gap-2.5">
          {[1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="card-comic-sm p-3 flex items-start gap-3"
            >
              <div className="w-9 h-9 rounded-lg border border-[var(--border-ink)] skeleton-shimmer shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="h-4 skeleton-shimmer rounded w-1/2" />
                  <div className="h-3 skeleton-shimmer rounded w-16" />
                </div>
                <div className="h-3 skeleton-shimmer rounded w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const MembershipSkeleton: React.FC = () => {
  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 pt-2 fade-in-comic">
      <div className="card-comic p-5 bg-[#8338EC]/85 text-white flex flex-col gap-3 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-white/25" />
            <div className="h-5 bg-white/25 rounded w-44" />
          </div>
          <div className="w-16 h-5 rounded bg-white/25" />
        </div>
        <div className="h-3.5 bg-white/20 rounded w-3/4" />
        <div className="h-3 bg-white/20 rounded w-1/2" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="card-comic p-4 flex flex-col gap-3 animate-pulse"
          >
            <div className="flex justify-between items-center">
              <div className="h-5 skeleton-shimmer rounded w-24" />
              <div className="w-12 h-4 skeleton-shimmer rounded" />
            </div>
            <div className="h-7 skeleton-shimmer rounded w-32" />
            <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-ink)]/20">
              <div className="h-3 skeleton-shimmer rounded w-full" />
              <div className="h-3 skeleton-shimmer rounded w-4/5" />
              <div className="h-3 skeleton-shimmer rounded w-2/3" />
            </div>
            <div className="h-9 skeleton-shimmer rounded-lg border border-[var(--border-ink)] mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const CommunityListSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="card-comic-sm p-3 flex items-center justify-between gap-3 animate-pulse"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-full border-2 border-[var(--border-ink)] skeleton-shimmer shrink-0" />
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <div className="h-3.5 skeleton-shimmer rounded w-36" />
              <div className="h-2.5 skeleton-shimmer rounded w-48 max-w-full" />
            </div>
          </div>
          <div className="w-14 h-5 rounded skeleton-shimmer shrink-0" />
        </div>
      ))}
    </div>
  );
};

export const ProfileSkeleton: React.FC = () => {
  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 pt-2 fade-in-comic">
      <div className="card-comic p-5 flex flex-col gap-4 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl border-2 border-[var(--border-ink)] skeleton-shimmer shrink-0" />
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="h-5 skeleton-shimmer rounded w-40" />
            <div className="h-3.5 skeleton-shimmer rounded w-56 max-w-full" />
            <div className="flex gap-2">
              <div className="w-16 h-5 skeleton-shimmer rounded" />
              <div className="w-20 h-5 skeleton-shimmer rounded" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t-2 border-[var(--border-ink)]">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card-comic-sm p-3 flex flex-col gap-2">
              <div className="h-3 skeleton-shimmer rounded w-16" />
              <div className="h-6 skeleton-shimmer rounded w-20" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card-comic-sm p-3.5 flex items-center gap-3 animate-pulse">
            <div className="w-14 h-14 rounded-lg skeleton-shimmer shrink-0" />
            <div className="flex flex-col gap-2 flex-1">
              <div className="h-3.5 skeleton-shimmer rounded w-3/4" />
              <div className="h-2.5 skeleton-shimmer rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SettingsSkeleton: React.FC = () => {
  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 pt-2 fade-in-comic">
      <div className="card-comic p-4 bg-[#FFE600]/80 text-[#111113] flex items-center gap-3 animate-pulse">
        <div className="w-9 h-9 rounded-xl border-2 border-[#111113] bg-white/80 shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="h-4 bg-black/20 rounded w-48" />
          <div className="h-3 bg-black/15 rounded w-64 max-w-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-comic p-4 flex flex-col gap-3 animate-pulse">
          <div className="flex justify-between items-center">
            <div className="h-4 skeleton-shimmer rounded w-36" />
            <div className="h-4 skeleton-shimmer rounded w-20" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-10 skeleton-shimmer rounded-lg border border-[var(--border-ink)]" />
            <div className="h-10 skeleton-shimmer rounded-lg border border-[var(--border-ink)]" />
            <div className="h-10 skeleton-shimmer rounded-lg border border-[var(--border-ink)]" />
          </div>
        </div>

        <div className="card-comic p-4 flex flex-col gap-3 animate-pulse">
          <div className="h-4 skeleton-shimmer rounded w-44" />
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border-2 border-[var(--border-ink)] skeleton-shimmer shrink-0" />
            <div className="flex flex-col gap-2 flex-1">
              <div className="h-4 skeleton-shimmer rounded w-32" />
              <div className="h-3 skeleton-shimmer rounded w-40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AdminTableSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="card-comic-sm p-3 flex items-center justify-between gap-3 animate-pulse"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-lg border border-[var(--border-ink)] skeleton-shimmer shrink-0" />
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <div className="h-3.5 skeleton-shimmer rounded w-1/2" />
              <div className="h-2.5 skeleton-shimmer rounded w-1/3" />
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <div className="w-12 h-7 skeleton-shimmer rounded border border-[var(--border-ink)]" />
            <div className="w-12 h-7 skeleton-shimmer rounded border border-[var(--border-ink)]" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const UploadSkeleton: React.FC = () => {
  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 pt-2 fade-in-comic">
      <div className="card-comic p-4 bg-[#FFE600]/80 text-[#111113] flex flex-col gap-2 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl border-2 border-[#111113] bg-white/80 shrink-0" />
            <div className="h-5 bg-black/20 rounded w-44" />
          </div>
          <div className="w-16 h-5 rounded bg-black/20" />
        </div>
        <div className="h-3 bg-black/15 rounded w-3/4" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="card-comic-sm p-3.5 flex flex-col gap-2 animate-pulse">
            <div className="flex justify-between items-center">
              <div className="h-3.5 skeleton-shimmer rounded w-36" />
              <div className="h-3.5 skeleton-shimmer rounded w-20" />
            </div>
            <div className="w-full h-2.5 rounded-full skeleton-shimmer border border-[var(--border-ink)]" />
          </div>

          <div className="card-comic p-4 flex flex-col gap-4 animate-pulse">
            <div className="flex flex-col gap-2">
              <div className="h-3.5 skeleton-shimmer rounded w-32" />
              <div className="h-10 skeleton-shimmer rounded-lg border-2 border-[var(--border-ink)] w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="h-10 skeleton-shimmer rounded-lg border-2 border-[var(--border-ink)]" />
              <div className="h-10 skeleton-shimmer rounded-lg border-2 border-[var(--border-ink)]" />
            </div>
            <div className="h-10 skeleton-shimmer rounded-lg border-2 border-[var(--border-ink)] mt-1" />
          </div>
        </div>
        <div className="lg:col-span-5">
          <div className="card-comic p-4 flex flex-col gap-3 animate-pulse">
            <div className="h-40 skeleton-shimmer rounded-xl border-2 border-[var(--border-ink)]" />
            <div className="h-4 skeleton-shimmer rounded w-3/4" />
            <div className="h-3 skeleton-shimmer rounded w-1/2" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const AdminOverviewSkeleton: React.FC = () => {
  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col pb-36 md:pb-28 fade-in-comic">
      <div className="w-full overflow-x-auto border-b-2 border-[var(--border-ink)] bg-[var(--surface-card)] px-4 py-2 flex gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="w-24 h-8 rounded-lg skeleton-shimmer border border-[var(--border-ink)] shrink-0 animate-pulse" />
        ))}
      </div>

      <div className="px-4 md:px-6 flex flex-col gap-4 pt-4">
        <div className="card-comic p-4 bg-[#FFE600]/80 text-[#111113] flex items-center justify-between animate-pulse">
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="h-5 bg-black/20 rounded w-48" />
            <div className="h-3.5 bg-black/15 rounded w-64 max-w-full" />
          </div>
          <div className="w-24 h-8 rounded-lg bg-black/20 border border-[#111113] shrink-0" />
        </div>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {[1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="card-comic p-4 flex flex-col justify-between animate-pulse"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="h-3 skeleton-shimmer rounded w-16" />
                <div className="w-8 h-8 rounded-lg border border-[var(--border-ink)] skeleton-shimmer shrink-0" />
              </div>
              <div className="h-7 skeleton-shimmer rounded w-20 my-1" />
              <div className="h-4 skeleton-shimmer rounded w-24 pt-2 mt-2" />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

export const AdminVipSkeleton: React.FC = () => {
  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col pb-36 md:pb-28 gap-4 fade-in-comic">
      <div className="w-full overflow-x-auto border-b-2 border-[var(--border-ink)] bg-[var(--surface-card)] px-4 py-2 flex gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="w-24 h-8 rounded-lg skeleton-shimmer border border-[var(--border-ink)] shrink-0 animate-pulse" />
        ))}
      </div>

      <div className="px-4 md:px-6 flex flex-col gap-4">
        <div className="card-comic p-4 bg-[#8338EC]/85 text-white flex flex-col gap-2 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/30" />
              <div className="h-5 bg-white/30 rounded w-48" />
            </div>
            <div className="w-20 h-5 rounded bg-white/30" />
          </div>
          <div className="h-3.5 bg-white/20 rounded w-3/4" />
        </div>

        <div className="card-comic p-4 flex flex-col gap-3 animate-pulse">
          <div className="h-4 skeleton-shimmer rounded w-44" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="h-10 skeleton-shimmer rounded-lg border border-[var(--border-ink)]" />
            <div className="h-10 skeleton-shimmer rounded-lg border border-[var(--border-ink)]" />
          </div>
        </div>
      </div>
    </div>
  );
};
