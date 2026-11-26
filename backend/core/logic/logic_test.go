package logic_test

import (
	"testing"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/core/logic"
)

func TestExtractYouTubeVideoID(t *testing.T) {
	testCases := []struct {
		name     string
		input    string
		expected string
		isErr    bool
	}{
		{"Standard Watch URL", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", false},
		{"Shorts URL", "https://youtube.com/shorts/dQw4w9WgXcQ?feature=share", "dQw4w9WgXcQ", false},
		{"Youtu.be URL", "https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ", false},
		{"Embed URL", "https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ", false},
		{"Music YouTube URL", "https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", false},
		{"Raw 11-char ID", "dQw4w9WgXcQ", "dQw4w9WgXcQ", false},
		{"Empty URL", "", "", true},
		{"Invalid URL", "https://google.com/search?q=youtube", "", true},
		{"Malicious Script URL (Anti-SSRF)", "javascript:alert(1)", "", true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			res := logic.ExtractYouTubeVideoID(tc.input)
			if tc.isErr {
				if res.IsOk() {
					t.Fatalf("Expected error for input %q, got ok: %v", tc.input, res.MustGet())
				}
			} else {
				if res.IsError() {
					t.Fatalf("Expected ok for input %q, got error: %v", tc.input, res.Error())
				}
				if res.MustGet() != tc.expected {
					t.Fatalf("Expected %q, got %q", tc.expected, res.MustGet())
				}
			}
		})
	}
}

func TestComputeLogicalEpisodes(t *testing.T) {
	t.Run("Short audio (2 hours) -> Exactly 1 episode", func(t *testing.T) {
		eps := logic.ComputeLogicalEpisodes(1, 7200, 14400)
		if len(eps) != 1 {
			t.Fatalf("Expected 1 episode, got %d", len(eps))
		}
		if eps[0].StartSeconds != 0 || eps[0].EndSeconds != 7200 || eps[0].DurationSeconds != 7200 {
			t.Fatalf("Invalid episode bounds: %+v", eps[0])
		}
	})

	t.Run("Audio with small remainder (4h 10m 22s) -> Exactly 1 episode merged into last", func(t *testing.T) {
		// 4h 10m 22s = 4*3600 + 10*60 + 22 = 15022s
		totalSec := 15022
		blockSize := 14400 // 4h

		eps := logic.ComputeLogicalEpisodes(1, totalSec, blockSize)
		if len(eps) != 1 {
			t.Fatalf("Expected 1 episode for 4h 10m 22s with 4h block, got %d", len(eps))
		}
		if eps[0].StartSeconds != 0 || eps[0].EndSeconds != totalSec || eps[0].DurationSeconds != totalSec {
			t.Fatalf("Invalid episode 1 bounds: %+v", eps[0])
		}
		if eps[0].Title != "Tập 1 (00:00:00 - 04:10:22)" {
			t.Fatalf("Unexpected title: %q", eps[0].Title)
		}
	})

	t.Run("Audio 8h 10m 22s with 4h block -> 2 episodes, last episode has 4h 10m 22s", func(t *testing.T) {
		// 8h 10m 22s = 8*3600 + 10*60 + 22 = 29422s
		totalSec := 29422
		blockSize := 14400

		eps := logic.ComputeLogicalEpisodes(1, totalSec, blockSize)
		if len(eps) != 2 {
			t.Fatalf("Expected 2 episodes, got %d", len(eps))
		}
		if eps[0].StartSeconds != 0 || eps[0].EndSeconds != 14400 || eps[0].DurationSeconds != 14400 {
			t.Fatalf("Invalid episode 1 bounds: %+v", eps[0])
		}
		if eps[1].StartSeconds != 14400 || eps[1].EndSeconds != totalSec || eps[1].DurationSeconds != 15022 {
			t.Fatalf("Invalid episode 2 bounds: %+v", eps[1])
		}
		if eps[1].Title != "Tập 2 (04:00:00 - 08:10:22)" {
			t.Fatalf("Unexpected title: %q", eps[1].Title)
		}
	})

	t.Run("Audio 10h 16m with 4h block -> 3 episodes", func(t *testing.T) {
		// 10h 16m = 36960s. Remainder = 2h 16m = 8160s > 1800s threshold -> 3 episodes
		totalSec := 36960
		blockSize := 14400

		eps := logic.ComputeLogicalEpisodes(1, totalSec, blockSize)
		if len(eps) != 3 {
			t.Fatalf("Expected 3 episodes, got %d", len(eps))
		}
		if eps[0].DurationSeconds != 14400 || eps[1].DurationSeconds != 14400 || eps[2].DurationSeconds != 8160 {
			t.Fatalf("Unexpected episode durations: %+v", eps)
		}
		if eps[2].EndSeconds != totalSec {
			t.Fatalf("Last episode end seconds mismatch: got %d, expected %d", eps[2].EndSeconds, totalSec)
		}
	})

	t.Run("Super long audio (26 hours) -> Exactly 7 continuous episodes", func(t *testing.T) {
		totalSec := 26 * 3600 // 93,600s
		blockSize := 14400    // 4h

		eps := logic.ComputeLogicalEpisodes(1, totalSec, blockSize)
		if len(eps) != 7 {
			t.Fatalf("Expected 7 episodes, got %d", len(eps))
		}

		// Verify continuous bounds: ep[i].end == ep[i+1].start
		for i := 0; i < len(eps)-1; i++ {
			if eps[i].EndSeconds != eps[i+1].StartSeconds {
				t.Fatalf("Gap detected between episode %d and %d: %d != %d",
					eps[i].EpisodeNumber, eps[i+1].EpisodeNumber, eps[i].EndSeconds, eps[i+1].StartSeconds)
			}
		}

		// Last episode must end at totalSec
		lastEp := eps[len(eps)-1]
		if lastEp.EndSeconds != totalSec {
			t.Fatalf("Last episode end seconds mismatch: got %d, expected %d", lastEp.EndSeconds, totalSec)
		}
		// 26h = 6 * 4h + 2h -> last episode is 2h (7200s)
		if lastEp.DurationSeconds != 7200 {
			t.Fatalf("Last episode duration mismatch: got %d, expected 7200", lastEp.DurationSeconds)
		}
	})
}

func TestCalculateProgress(t *testing.T) {
	t.Run("Normal progress within bounds", func(t *testing.T) {
		res := logic.CalculateProgress(7200, 14400)
		if res.ProgressPercent != 50.0 || res.Completed != false {
			t.Fatalf("Expected 50.0%% and not completed, got %+v", res)
		}
	})

	t.Run("Near completion (96%) -> Completed = true", func(t *testing.T) {
		res := logic.CalculateProgress(13850, 14400) // ~96.18%
		if !res.Completed {
			t.Fatalf("Expected completed=true for 96%%, got %+v", res)
		}
	})

	t.Run("Over duration clamping", func(t *testing.T) {
		res := logic.CalculateProgress(20000, 14400)
		if res.PositionSeconds != 14400 || res.ProgressPercent != 100.0 || !res.Completed {
			t.Fatalf("Expected clamping to 14400 and 100%%, got %+v", res)
		}
	})
}

func TestPolicyEngine(t *testing.T) {
	guest := domain.User{Role: domain.RoleGuest, IsGuest: true}
	freeUser := domain.User{Role: domain.RoleUser, Membership: domain.MembershipFree}
	vipUser := domain.User{Role: domain.RoleUser, Membership: domain.MembershipVIP}
	admin := domain.User{Role: domain.RoleAdmin}

	// Guest cannot import
	can, _ := logic.CanImportYouTube(guest, 0)
	if can {
		t.Fatal("Guest should not be allowed to import")
	}

	// Free user max 5
	can, _ = logic.CanImportYouTube(freeUser, 4)
	if !can {
		t.Fatal("Free user with 4 imports should still be allowed")
	}
	can, _ = logic.CanImportYouTube(freeUser, 5)
	if can {
		t.Fatal("Free user with 5 imports should be blocked")
	}

	// VIP & Admin unlimited
	can, _ = logic.CanImportYouTube(vipUser, 999)
	if !can {
		t.Fatal("VIP should have unlimited imports")
	}
	can, _ = logic.CanImportYouTube(admin, 999)
	if !can {
		t.Fatal("Admin should have unlimited imports")
	}

	// Test CanAccessEpisode (Episode 1 preview allowed for free user, Episode 2+ locked unless VIP)
	vipAudio := domain.Audio{IsVIPOnly: true}
	freeAudio := domain.Audio{IsVIPOnly: false}
	ep1 := domain.Episode{EpisodeNumber: 1}
	ep2 := domain.Episode{EpisodeNumber: 2}

	// Normal audio: all episodes allowed
	canEp, _ := logic.CanAccessEpisode(freeUser, freeAudio, ep1)
	if !canEp {
		t.Fatal("Free audio ep 1 should be accessible")
	}
	canEp, _ = logic.CanAccessEpisode(freeUser, freeAudio, ep2)
	if !canEp {
		t.Fatal("Free audio ep 2 should be accessible")
	}

	// VIP audio: Ep 1 preview allowed for free user
	canEp, _ = logic.CanAccessEpisode(freeUser, vipAudio, ep1)
	if !canEp {
		t.Fatal("VIP audio ep 1 preview should be accessible for free user")
	}

	// VIP audio: Ep 2 locked for free user
	canEp, _ = logic.CanAccessEpisode(freeUser, vipAudio, ep2)
	if canEp {
		t.Fatal("VIP audio ep 2 should be locked for free user")
	}

	// VIP audio: Ep 2 allowed for VIP user and Admin
	canEp, _ = logic.CanAccessEpisode(vipUser, vipAudio, ep2)
	if !canEp {
		t.Fatal("VIP audio ep 2 should be accessible for VIP user")
	}
	canEp, _ = logic.CanAccessEpisode(admin, vipAudio, ep2)
	if !canEp {
		t.Fatal("VIP audio ep 2 should be accessible for Admin")
	}
}

func TestDurationParsingAndFormatting(t *testing.T) {
	t.Run("InferDuration from Vietnamese title with 22 hours", func(t *testing.T) {
		title := "Phàm Nhân Tu Tiên - 22 Giờ Trọn Bộ"
		sec := logic.InferDuration(title, 57600)
		if sec != 22*3600 {
			t.Fatalf("Expected 22 hours (79200s), got %d", sec)
		}
	})

	t.Run("ParseISO8601Duration for 22h15m30s", func(t *testing.T) {
		sec := logic.ParseISO8601Duration("PT22H15M30S")
		expected := 22*3600 + 15*60 + 30
		if sec != expected {
			t.Fatalf("Expected %d, got %d", expected, sec)
		}
	})

	t.Run("ExtractDurationFromHTML with approxDurationMs (22 hours)", func(t *testing.T) {
		fakeHTML := `{"videoDetails":{"title":"Truyện dài","approxDurationMs":"79200000","author":"Audio"}}`
		sec := logic.ExtractDurationFromHTML(fakeHTML)
		if sec != 79200 {
			t.Fatalf("Expected 79200s (22h), got %d", sec)
		}
	})

	t.Run("ExtractDurationFromHTML with lengthSeconds (22 hours)", func(t *testing.T) {
		fakeHTML := `<div data-player='{"lengthSeconds":"79200"}'></div>`
		sec := logic.ExtractDurationFromHTML(fakeHTML)
		if sec != 79200 {
			t.Fatalf("Expected 79200s (22h), got %d", sec)
		}
	})

	t.Run("FormatDuration and FormatTime for 22 hours", func(t *testing.T) {
		formattedDur := logic.FormatDuration(79200)
		if formattedDur != "22h 00m" {
			t.Fatalf("Expected '22h 00m', got %q", formattedDur)
		}

		formattedTime := logic.FormatTime(79200)
		if formattedTime != "22:00:00" {
			t.Fatalf("Expected '22:00:00', got %q", formattedTime)
		}
	})

	t.Run("ComputeLogicalEpisodes for 22 hours (79200s) -> 6 episodes", func(t *testing.T) {
		eps := logic.ComputeLogicalEpisodes(1, 79200, 14400)
		if len(eps) != 6 {
			t.Fatalf("Expected 6 episodes for 22 hours, got %d", len(eps))
		}
		// First 5 episodes are 4h (14400s), 6th episode is 2h (7200s)
		for i := 0; i < 5; i++ {
			if eps[i].DurationSeconds != 14400 {
				t.Fatalf("Episode %d expected 14400s, got %d", i+1, eps[i].DurationSeconds)
			}
		}
		if eps[5].DurationSeconds != 7200 {
			t.Fatalf("Episode 6 expected 7200s, got %d", eps[5].DurationSeconds)
		}
	})

	t.Run("ParseDurationString comprehensive cases", func(t *testing.T) {
		cases := []struct {
			input    string
			expected int
		}{
			{"10h 16m 22s", 36982},
			{"10h 16m", 36960},
			{"4 giờ 10 phút 22 giây", 15022},
			{"04:10:22", 15022},
			{"10:16", 616},
			{"15022", 15022},
			{"4h", 14400},
			{"30m", 1800},
			{"", 0},
		}
		for _, c := range cases {
			actual := logic.ParseDurationString(c.input)
			if actual != c.expected {
				t.Fatalf("ParseDurationString(%q) = %d, expected %d", c.input, actual, c.expected)
			}
		}
	})
}

func TestCalculateResumeState(t *testing.T) {
	audio := domain.Audio{ID: 1, Title: "Truyện Test"}
	episodes := []domain.Episode{
		{ID: 101, AudioID: 1, EpisodeNumber: 1, Title: "Tập 1", DurationSeconds: 14400, StartSeconds: 0, EndSeconds: 14400},
		{ID: 102, AudioID: 1, EpisodeNumber: 2, Title: "Tập 2", DurationSeconds: 14400, StartSeconds: 14400, EndSeconds: 28800},
		{ID: 103, AudioID: 1, EpisodeNumber: 3, Title: "Tập 3", DurationSeconds: 14400, StartSeconds: 28800, EndSeconds: 43200},
	}

	t.Run("Resumes most recently listened episode even if episode 1 has progress", func(t *testing.T) {
		now := time.Now().UTC()
		progresses := []domain.ListeningProgress{
			{
				EpisodeID:       101,
				PositionSeconds: 5000,
				ProgressPercent: 34.72,
				Completed:       false,
				UpdatedAt:       now.Add(-2 * time.Hour),
			},
			{
				EpisodeID:       102,
				PositionSeconds: 1800,
				ProgressPercent: 12.5,
				Completed:       false,
				UpdatedAt:       now.Add(-10 * time.Minute), // More recent!
			},
		}

		resume := logic.CalculateResumeState(audio, episodes, progresses)
		if resume.CurrentEpisodeID != 102 || resume.CurrentEpisodeNumber != 2 {
			t.Fatalf("Expected resume to Episode 2 (102), got episode %d (id %d)", resume.CurrentEpisodeNumber, resume.CurrentEpisodeID)
		}
		if resume.LastPositionSeconds != 1800 {
			t.Fatalf("Expected position 1800s, got %d", resume.LastPositionSeconds)
		}
	})

	t.Run("Completed episode 1 resumes episode 2 at 0s", func(t *testing.T) {
		now := time.Now().UTC()
		progresses := []domain.ListeningProgress{
			{
				EpisodeID:       101,
				PositionSeconds: 14400,
				ProgressPercent: 100.0,
				Completed:       true,
				UpdatedAt:       now,
			},
		}

		resume := logic.CalculateResumeState(audio, episodes, progresses)
		if resume.CurrentEpisodeID != 102 || resume.CurrentEpisodeNumber != 2 {
			t.Fatalf("Expected resume to Episode 2, got episode %d (id %d)", resume.CurrentEpisodeNumber, resume.CurrentEpisodeID)
		}
		if resume.LastPositionSeconds != 0 {
			t.Fatalf("Expected position 0s, got %d", resume.LastPositionSeconds)
		}
	})
}

func TestFormatSlug(t *testing.T) {
	testCases := []struct {
		input    string
		expected string
	}{
		{"Tiên Hiệp", "tien-hiep"},
		{"Tu Tiên", "tu-tien"},
		{"  #Kiếm Hiệp  ", "kiem-hiep"},
		{"Huyền Huyễn - Dị Giới", "huyen-huyen-di-gioi"},
		{"Audiobook", "audiobook"},
		{"Sách Nói 2026", "sach-noi-2026"},
		{"Đô Thị", "do-thi"},
		{"Linh Dị Ma Quái & Trừ Tà", "linh-di-ma-quai-tru-ta"},
		{"  ###  ", ""},
		{"", ""},
		{"Tag_With_Underscore", "tag-with-underscore"},
		{"Trọng Sinh, Xuyên Không", "trong-sinh-xuyen-khong"},
	}

	for _, tc := range testCases {
		t.Run(tc.input, func(t *testing.T) {
			actual := logic.FormatSlug(tc.input)
			if actual != tc.expected {
				t.Errorf("FormatSlug(%q) = %q, expected %q", tc.input, actual, tc.expected)
			}
		})
	}
}
