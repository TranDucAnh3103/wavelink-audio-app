'use client';

import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAudios, useToggleFavorite } from "@/hooks/useAudio";
import { useCategories } from "@/hooks/useCategories";
import { useTags } from "@/hooks/useTags";
import { usePlayerStore } from "@/stores/playerStore";
import { useAuthStore } from "@/stores/authStore";
import { LoadingState } from "@/components/common/LoadingState";
import { LibraryListSkeleton } from "@/components/common/Skeletons";
import { EmptyState } from "@/components/common/EmptyState";
import { toast } from "@/components/ui/Toast";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/config/pagination";

export const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { currentAudio, isPlaying, play, togglePlay } = usePlayerStore();
  const toggleFavoriteMutation = useToggleFavorite();

  const urlCategory = searchParams.get("categoryId")
    ? Number(searchParams.get("categoryId"))
    : null;
  const urlStatus = searchParams.get("status") || "all";
  const urlSearch = searchParams.get("search") || "";
  const urlUserId =
    searchParams.get("userId") || searchParams.get("createdBy") || "";

  const [activeCategory, setActiveCategory] = useState<number | null>(
    urlCategory,
  );
  const [activeStatus, setActiveStatus] = useState<string>(urlStatus);
  const [searchQuery, setSearchQuery] = useState<string>(urlSearch);

  const isComposingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (urlCategory !== activeCategory) setActiveCategory(urlCategory);
  }, [urlCategory, activeCategory]);

  const { data: categories = [] } = useCategories();
  const { data: tags = [] } = useTags();

  // Kiểm tra xem đang lọc truyện của chính mình hay của người khác
  const isViewingMyStories = Boolean(
    activeStatus === "my" ||
    (urlUserId && user?.id && String(user.id) === String(urlUserId)),
  );
  const isViewingOtherUserStories = Boolean(
    urlUserId && (!user?.id || String(user.id) !== String(urlUserId)),
  );

  const { data: audios = [], isLoading } = useAudios({
    search: searchQuery,
    categoryId: activeCategory,
    status: isViewingMyStories
      ? "my"
      : activeStatus === "all"
        ? null
        : activeStatus,
    userId: urlUserId || undefined,
  });

  // Khử trùng lặp thẻ truyện (Deduplicate) để mỗi audio chỉ xuất hiện đúng 1 thẻ duy nhất
  const uniqueAudios = React.useMemo(() => {
    const seen = new Set<number | string>();
    return audios.filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
  }, [audios]);

  // Phân trang 12 phần tử (hoặc cấu hình từ env)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = DEFAULT_PAGE_SIZE;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeCategory, activeStatus]);

  const totalPages = Math.max(1, Math.ceil(uniqueAudios.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedAudios = React.useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return uniqueAudios.slice(start, start + pageSize);
  }, [uniqueAudios, safeCurrentPage, pageSize]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams);
      if (val) nextParams.set("search", val);
      else nextParams.delete("search");
      setSearchParams(nextParams);
    }, 350);
  };

  const handleCategorySelect = (catId: number | null) => {
    setActiveCategory(catId);
    const nextParams = new URLSearchParams(searchParams);
    if (catId) nextParams.set("categoryId", String(catId));
    else nextParams.delete("categoryId");
    setSearchParams(nextParams);
  };

  const handleStatusSelect = (status: string) => {
    setActiveStatus(status);
    const nextParams = new URLSearchParams(searchParams);
    if (status === "my") {
      if (user?.id) {
        nextParams.set("userId", String(user.id));
        nextParams.delete("status");
      } else {
        toast.info("Vui lòng đăng nhập để xem truyện của bạn");
        navigate("/login");
        return;
      }
    } else {
      nextParams.delete("userId");
      nextParams.delete("createdBy");
      if (status && status !== "all") nextParams.set("status", status);
      else nextParams.delete("status");
    }
    setSearchParams(nextParams);
  };

  const handleTagClick = (tagName: string) => {
    handleSearchChange(tagName);
  };

  const handleResetFilters = () => {
    setActiveCategory(null);
    setActiveStatus("all");
    setSearchQuery("");
    setSearchParams({});
  };

  return (
    <div className="flex flex-col w-full px-4 pb-36 gap-4 pt-2 fade-in-comic">
      {/* 1. Comic Search Bar */}
      <div className="relative w-full">
        <i className="ri-search-2-line absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-700 text-base pointer-events-none font-bold z-10" />
        <input
          id="lib-search-input"
          type="text"
          placeholder="Tìm theo tên truyện, tác giả, video ID, tag..."
          value={searchQuery}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            isComposingRef.current = false;
            handleSearchChange(e.currentTarget.value);
          }}
          onChange={(e) => {
            if (!isComposingRef.current) {
              handleSearchChange(e.target.value);
            }
          }}
          className="input-comic pl-10 pr-10 text-xs md:text-sm w-full"
          autoComplete="off"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => handleSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded flex items-center justify-center border border-black bg-white hover:bg-gray-100 active:translate-x-0.5 active:translate-y-0.5 z-10 text-black"
            title="Xóa tìm kiếm"
          >
            <i className="ri-close-line text-xs font-bold" />
          </button>
        )}
      </div>

      {/* 2. Categories Filter Horizontal Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => handleCategorySelect(null)}
          className={`cat-filter-btn btn-comic text-xs py-1.5 px-3.5 whitespace-nowrap ${
            !activeCategory ? "btn-comic-yellow" : "bg-white"
          }`}
        >
          Tất cả
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => handleCategorySelect(c.id)}
            className={`cat-filter-btn btn-comic text-xs py-1.5 px-3 whitespace-nowrap ${
              activeCategory === c.id ? "btn-comic-yellow" : "bg-white"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Banner hiển thị khi lọc theo ID người dùng cụ thể */}
      {isViewingOtherUserStories && (
        <div className="card-comic-sm p-2.5 bg-[#FEF9C3] flex items-center justify-between border-2 border-black shadow-comic-sm">
          <div className="flex items-center gap-2 min-w-0">
            <i className="ri-user-shared-fill text-[#3A86FF] text-base shrink-0" />
            <span className="text-xs font-black text-black truncate">
              Đang lọc kho truyện của độc giả #{urlUserId}
            </span>
          </div>
          <button
            onClick={() => {
              const nextParams = new URLSearchParams(searchParams);
              nextParams.delete("userId");
              nextParams.delete("createdBy");
              setSearchParams(nextParams);
            }}
            className="text-xs text-red-600 font-bold hover:underline px-1 shrink-0"
          >
            ✕ Xóa bộ lọc
          </button>
        </div>
      )}

      {/* 3. Status Filter Chips */}
      <div className="card-comic-sm p-1.5 bg-white flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
        <button
          onClick={() => handleStatusSelect("all")}
          className={`status-chip flex-1 py-1 px-2 rounded font-extrabold text-[11px] whitespace-nowrap transition-all ${
            activeStatus === "all" && !urlUserId
              ? "bg-[#FFE600] text-black border border-black shadow-comic-sm"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          Tất cả ({uniqueAudios.length})
        </button>
        <button
          onClick={() => handleStatusSelect("my")}
          className={`status-chip flex-1 py-1 px-2 rounded font-extrabold text-[11px] whitespace-nowrap transition-all ${
            isViewingMyStories
              ? "bg-[#FFE600] text-black border border-black shadow-comic-sm"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          {user?.id ? `Của tôi ` : "Của tôi"}
        </button>
        <button
          onClick={() => handleStatusSelect("listening")}
          className={`status-chip flex-1 py-1 px-2 rounded font-extrabold text-[11px] whitespace-nowrap transition-all ${
            activeStatus === "listening"
              ? "bg-[#3A86FF] text-white border border-black shadow-comic-sm"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          Đang cày
        </button>
        <button
          onClick={() => handleStatusSelect("completed")}
          className={`status-chip flex-1 py-1 px-2 rounded font-extrabold text-[11px] whitespace-nowrap transition-all ${
            activeStatus === "completed"
              ? "bg-[#2A9D8F] text-white border border-black shadow-comic-sm"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          Hoàn thành
        </button>
        <button
          onClick={() => handleStatusSelect("favorite")}
          className={`status-chip flex-1 py-1 px-2 rounded font-extrabold text-[11px] whitespace-nowrap transition-all ${
            activeStatus === "favorite"
              ? "bg-[#E63946] text-white border border-black shadow-comic-sm"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          <i className="ri-heart-3-fill" /> Yêu thích
        </button>
      </div>

      {/* 4. Quick Tag Clouds */}
      {tags && tags.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {tags.slice(0, 10).map((t) => (
            <button
              key={t.id}
              onClick={() => handleTagClick(t.name)}
              className="tag-quick-btn badge-comic badge-comic-white hover:badge-comic-yellow transition-all cursor-pointer text-[10px]"
            >
              #{t.name}
            </button>
          ))}
        </div>
      )}

      {/* 5. Audio Cards Container */}
      {isLoading ? (
        <LibraryListSkeleton />
      ) : uniqueAudios.length === 0 ? (
        <EmptyState
          icon="ri-search-eye-line"
          title="Không tìm thấy Audio phù hợp"
          description="Hãy thử đổi từ khóa tìm kiếm hoặc chọn danh mục thể loại khác."
          actionText="Xóa tất cả bộ lọc"
          onAction={handleResetFilters}
        />
      ) : (
        <div className="flex flex-col gap-3" id="lib-audio-list">
          {paginatedAudios.map((a) => {
            const isCurrentlyPlaying = Boolean(isPlaying && currentAudio && String(currentAudio.id) === String(a.id));
            return (
              <div
                key={a.id}
                className="card-comic p-3 flex flex-col gap-2.5 bg-white relative group"
              >
                <div className="flex items-start gap-3">
                  {/* Manga Thumbnail */}
                  <div
                    className="relative w-20 h-24 rounded-lg border-2 border-black overflow-hidden shrink-0 bg-black shadow-comic-sm cursor-pointer"
                    onClick={() => navigate(`/player/${a.id}`)}
                  >
                    <img
                      src={a.thumbnailUrl}
                      alt={a.title}
                      className="w-full h-full object-cover"
                    />
                    {isCurrentlyPlaying && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center">
                        <div className="comic-eq-container">
                          <div className="comic-eq-bar !bg-white" />
                          <div className="comic-eq-bar !bg-white" />
                          <div className="comic-eq-bar !bg-white" />
                        </div>
                      </div>
                    )}
                    <span className="absolute bottom-1 left-1 badge-comic badge-comic-yellow text-[8px] py-0 px-1 font-black">
                      {a.totalEpisodes || a.episodes?.length || 1} TẬP
                    </span>
                  </div>

                  {/* Info Details */}
                  <div className="flex flex-col justify-between min-w-0 flex-1 h-24 py-0.5">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="badge-comic badge-comic-blue text-[9px] py-0 px-1.5 font-bold truncate">
                            {a.categoryName || "Chung"}
                          </span>
                          {a.isVIPOnly && (
                            <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1 font-black">
                              VIP
                            </span>
                          )}
                          {a.createdBy && user && a.createdBy === user.id && (
                            <span className="badge-comic badge-comic-yellow text-[8px] py-0 px-1 font-black">
                              CỦA TÔI
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteMutation.mutate(a.id);
                          }}
                          className="w-7 h-7 rounded border border-black bg-white flex items-center justify-center shadow-comic-sm hover:bg-gray-100 active:translate-x-0.5 active:translate-y-0.5"
                          title="Yêu thích"
                        >
                          <i
                            className={`${
                              a.isFavorite
                                ? "ri-heart-3-fill text-[#E63946]"
                                : "ri-heart-3-line text-black"
                            } text-sm font-bold`}
                          />
                        </button>
                      </div>
                      <h3
                        className="font-extrabold text-xs md:text-sm text-black truncate cursor-pointer hover:text-[#3A86FF] transition-colors mt-1"
                        onClick={() => navigate(`/player/${a.id}`)}
                      >
                        {a.title}
                      </h3>
                      <p className="text-[11px] font-semibold text-gray-500 truncate mt-0.5">
                        Tác giả: {a.author || "Đang cập nhật"}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono font-bold text-gray-700 pt-1 border-t border-gray-200">
                      <span className="text-[11px]">
                        {a.formattedDuration || "24h 00m"}
                      </span>
                      <span
                        className={`badge-comic ${
                          (a.progressPercent || 0) >= 100
                            ? "badge-comic-teal"
                            : (a.progressPercent || 0) > 0
                              ? "badge-comic-yellow"
                              : "badge-comic-white"
                        } text-[9px] py-0 px-1`}
                      >
                        {(a.progressPercent || 0) >= 100
                          ? "ĐÃ XONG"
                          : (a.progressPercent || 0) > 0
                            ? `${a.progressPercent}%`
                            : "CHƯA NGHE"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress bar & Action Bar */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-black">
                  <div className="w-full bg-gray-200 h-2 rounded-full border border-black overflow-hidden flex-1 shadow-comic-sm">
                    <div
                      className="bg-[#3A86FF] h-full"
                      style={{ width: `${a.progressPercent || 0}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => navigate(`/player/${a.id}`)}
                      className="btn-comic text-[11px] py-1 px-2.5 bg-gray-100"
                    >
                      <i className="ri-list-check-2 font-bold" /> Tập
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (currentAudio && String(currentAudio.id) === String(a.id)) {
                          togglePlay();
                        } else {
                          const isVipOrAdmin =
                            user?.role === "VIP" ||
                            user?.role === "ADMIN" ||
                            user?.membership === "VIP";
                          const isVipAudio = Boolean(
                            a.isVIPOnly || a.isVipOnly,
                          );
                          const totalEps =
                            a.totalEpisodes || a.episodes?.length || 1;
                          if (isVipAudio && !isVipOrAdmin && totalEps <= 1) {
                            toast.error(
                              "Nội dung này độc quyền dành riêng cho thành viên VIP. Vui lòng nâng cấp gói!",
                            );
                            navigate("/membership");
                            return;
                          }
                          play(a);
                        }
                      }}
                      className={`btn-comic ${
                        isCurrentlyPlaying
                          ? "btn-comic-yellow"
                          : "btn-comic-primary"
                      } text-[11px] py-1 px-3`}
                    >
                      <i
                        className={`${isCurrentlyPlaying ? "ri-pause-fill" : "ri-play-fill"} text-sm font-bold`}
                      />
                      <span>{isCurrentlyPlaying ? "Dừng" : "Cày"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination controls */}
      {!isLoading && uniqueAudios.length > 0 && (
        <Pagination
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalItems={uniqueAudios.length}
          pageSize={pageSize}
          onPageChange={(p) => {
            setCurrentPage(p);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
};
