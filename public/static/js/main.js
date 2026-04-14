// 전역 변수들
let photos = [];
let currentLightboxIndex = 0;
let audio = null;
let isPlaying = false;
let isMuted = false;
let volume = 0.3;
let config = null;
let autoplayPromptShown = false;
let bgmBannerHideTimeout = null;
let bgmFirstInteractionHandler = null;
let bgmAutoplayAttempt = null;
const PHOTO_UPLOAD_ENABLED = false;
const GALLERY_LIGHTBOX_HISTORY_KEY = '__gallery_lightbox_open__';
const MAP_LIGHTBOX_HISTORY_KEY = '__map_lightbox_open__';
let galleryLightboxReopenGuardUntil = 0;
let mapLightboxReopenGuardUntil = 0;

function getBasePath() {
    const path = window.location.pathname || '/';
    if (path.endsWith('/')) return path;
    const idx = path.lastIndexOf('/');
    return idx >= 0 ? path.slice(0, idx + 1) : '/';
}

function resolveStaticPath(path) {
    if (typeof path !== 'string' || path.length === 0) return path;
    if (/^https?:\/\//.test(path)) return path;
    if (!path.startsWith('/static/')) return path;
    return `${getBasePath()}static/${path.slice('/static/'.length)}`;
}

function normalizeConfigPaths(value) {
    if (Array.isArray(value)) {
        value.forEach(normalizeConfigPaths);
        return;
    }

    if (value && typeof value === 'object') {
        Object.keys(value).forEach((key) => {
            const current = value[key];
            if (typeof current === 'string') {
                value[key] = resolveStaticPath(current);
            } else {
                normalizeConfigPaths(current);
            }
        });
    }
}

// 성능 최적화: Intersection Observer로 이미지 지연 로딩
let imageObserver = null;

// 설정 로드
function loadConfig() {
    const configElement = document.getElementById('config-data');
    if (configElement) {
        config = JSON.parse(configElement.textContent);
        normalizeConfigPaths(config);
    } else {
        console.error('Config data not found');
    }
}

// 페이지 초기화 - 성능 최적화
function initializePage() {
    loadConfig();
    
    // 오프닝 애니메이션 중인지 확인하고 초기 로딩 클래스 관리
    const introOverlay = document.getElementById('intro-animation-overlay');
    if (introOverlay && introOverlay.style.display !== 'none') {
        document.body.classList.add('intro-active');
        // 오프닝이 있으면 배경음악 초기화는 나중으로 미룸 (리소스 집중)
        setTimeout(initializeBackgroundMusic, 2000);
    } else {
        // 오프닝이 없으면 즉시 초기화
        initializeBackgroundMusic();
    }
    
    document.body.classList.add('loaded');

    // 즉시 필요한 것만 초기화
    calculateDDay();
    initializeQnA();

    // Intersection Observer 설정
    setupIntersectionObserver();

    // 지연 로딩할 항목들 (오프닝 애니메이션에 집중하기 위해 우선순위 낮춤)
    requestIdleCallback(() => {
        initializeGallery();
        // Kakao SDK는 defer로 로드
        initializeKakaoSDK();
    });

    // 1초마다 D-day 업데이트 (실시간 카운트다운)
    setInterval(calculateDDay, 1000);

    document.addEventListener('keydown', handleKeydown);
    initializeModalForms();

    ensureLucideIcons();
}

// Intersection Observer 설정 - 이미지 지연 로딩
function setupIntersectionObserver() {
    if ('IntersectionObserver' in window) {
        imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                    }
                    imageObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px' // 50px 전에 미리 로드
        });
    }
}

// requestIdleCallback 폴리필
window.requestIdleCallback = window.requestIdleCallback || function(cb) {
    const start = Date.now();
    return setTimeout(() => {
        cb({
            didTimeout: false,
            timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
        });
    }, 1);
};

// Lucide 아이콘 재초기화 함수 - 성능 개선 (debounce 적용)
let lucideInitTimeout = null;
let lucideInitialized = false;

function reinitializeLucideIcons() {
    if (lucideInitTimeout) {
        clearTimeout(lucideInitTimeout);
    }

    // debounce: 100ms 내 연속 호출 시 마지막 것만 실행
    lucideInitTimeout = setTimeout(() => {
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            try {
                lucide.createIcons();
            } catch (error) {
                console.error('❌ Lucide 아이콘 초기화 실패:', error);
            }
        }
    }, 50);
}

// 페이지 로드 후 아이콘 초기화 - 한 번만 실행
function ensureLucideIcons() {
    if (lucideInitialized) return;

    // requestIdleCallback으로 우선순위 낮춤
    const initIcons = () => {
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
            lucideInitialized = true;
        }
    };

    if ('requestIdleCallback' in window) {
        requestIdleCallback(initIcons, { timeout: 500 });
    } else {
        setTimeout(initIcons, 100);
    }
}

// 모달 폼 초기화
function initializeModalForms() {
    // 현재 초기화할 모달 폼이 없습니다.
}

// D-day 계산 - 성능 최적화 (DOM 캐싱 및 변경 시에만 업데이트)
let dDayCache = { days: null, hours: null, minutes: null, seconds: null };
let dDayElements = null;

function calculateDDay() {
    if (!config) return;

    // DOM 요소 캐싱 (첫 호출 시에만)
    if (!dDayElements) {
        dDayElements = {
            dDay: document.getElementById('d-day-text'),
            days: document.getElementById('countdown-days'),
            hours: document.getElementById('countdown-hours'),
            minutes: document.getElementById('countdown-minutes'),
            seconds: document.getElementById('countdown-seconds')
        };
    }

    const targetDate = new Date(config.wedding.date.iso_format);
    const now = new Date();
    const diff = targetDate.getTime() - now.getTime();

    let days, hours, minutes, seconds;

    if (diff <= 0) {
        days = hours = minutes = seconds = 0;
    } else {
        days = Math.floor(diff / (1000 * 60 * 60 * 24));
        hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        seconds = Math.floor((diff % (1000 * 60)) / 1000);
    }

    // 값이 변경된 경우에만 DOM 업데이트 (리플로우 최소화)
    if (dDayCache.days !== days) {
        dDayCache.days = days;
        if (dDayElements.dDay) dDayElements.dDay.textContent = days + '일';
        if (dDayElements.days) dDayElements.days.textContent = days;
    }
    if (dDayCache.hours !== hours) {
        dDayCache.hours = hours;
        if (dDayElements.hours) dDayElements.hours.textContent = hours;
    }
    if (dDayCache.minutes !== minutes) {
        dDayCache.minutes = minutes;
        if (dDayElements.minutes) dDayElements.minutes.textContent = minutes;
    }
    if (dDayCache.seconds !== seconds) {
        dDayCache.seconds = seconds;
        if (dDayElements.seconds) dDayElements.seconds.textContent = seconds;
    }
}

// Google Calendar 추가
function addToGoogleCalendar() {
    if (!config) return;

    const weddingDate = config.wedding.date;
    const venue = config.wedding.venue;
    const groom = config.wedding.groom.name_kr;
    const bride = config.wedding.bride.name_kr;

    const startDate = new Date(weddingDate.iso_format).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const endDate = new Date(new Date(weddingDate.iso_format).getTime() + 2 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const title = encodeURIComponent(`${groom} ♥ ${bride} 결혼식`);
    const details = encodeURIComponent(
        `${groom}과 ${bride}의 결혼식에 초대합니다!\n\n📍 장소: ${venue.name}\n📍 주소: ${venue.address}\n⏰ 시간: ${weddingDate.display_time}\n\n따뜻한 축복과 응원 부탁드립니다.`
    );
    const location = encodeURIComponent(`${venue.name}, ${venue.address}`);
    const dates = `${startDate}/${endDate}`;

    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}&sf=true&output=xml`;
    window.open(googleCalendarUrl, '_blank');
}

function normalizeGalleryBasePath(path) {
    if (typeof path !== 'string') return '';
    return path.endsWith('/') ? path : `${path}/`;
}

function encodePathSegment(name) {
    return String(name)
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}

async function loadGalleryManifest(basePath) {
    const manifestUrl = `${basePath}manifest.json?v=${Date.now()}`;

    try {
        const response = await fetch(manifestUrl, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const manifest = await response.json();
        if (!manifest || !Array.isArray(manifest.files)) {
            return [];
        }

        return manifest.files
            .map((name) => String(name).trim())
            .filter((name) => name.length > 0);
    } catch (error) {
        console.warn('갤러리 manifest 로드 실패, 기존 방식으로 폴백합니다:', error);
        return [];
    }
}

async function detectSequentialGalleryFiles(basePath, maxCount = 200) {
    const discovered = [];

    for (let i = 1; i <= maxCount; i += 1) {
        const candidate = `${basePath}${i}.webp?v=${Date.now()}`;
        let exists = false;

        try {
            const response = await fetch(candidate, { method: 'HEAD', cache: 'no-store' });
            exists = response.ok;
        } catch (error) {
            exists = false;
        }

        if (!exists) {
            break;
        }

        discovered.push(`${i}.webp`);
    }

    return discovered;
}

// 갤러리 초기화 - 3열 그리드
async function initializeGallery() {
    if (!config) return;

    const basePath = normalizeGalleryBasePath(config.assets.gallery_path);
    const manifestFiles = await loadGalleryManifest(basePath);

    let galleryFiles = manifestFiles;
    if (galleryFiles.length === 0) {
        galleryFiles = await detectSequentialGalleryFiles(basePath);
    }

    if (galleryFiles.length > 0) {
        photos = galleryFiles.map((fileName) => ({
            src: `${basePath}${encodePathSegment(fileName)}`,
            key: fileName,
        }));
    } else {
        photos = [];
    }

    // 모든 사진을 그리드로 렌더링
    renderPhotoGrid();

    // 라이트박스 스와이프 제스처 초기화
    initializeLightboxSwipe();
}

// 사진 그리드 렌더링 - 모든 사진을 3열 그리드로 표시
function renderPhotoGrid() {
    const photoGrid = document.getElementById('photo-grid');

    photoGrid.innerHTML = photos.map((photo, index) => {
        return `
            <div class="photo-item" data-index="${index}" onclick="openGalleryLightbox(${index}, event)">
                <img data-src="${photo.src}" alt="Gallery photo ${index + 1}" loading="lazy" decoding="async" style="background: #f5f5f5;" />
            </div>
        `;
    }).join('');

    // Intersection Observer로 이미지 지연 로딩
    if (imageObserver) {
        photoGrid.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    } else {
        // 폴백: data-src를 src로 즉시 변환
        photoGrid.querySelectorAll('img[data-src]').forEach(img => {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
        });
    }
}

function isGalleryLightboxState(state) {
    return Boolean(state && state[GALLERY_LIGHTBOX_HISTORY_KEY]);
}

// 갤러리 라이트박스 열기
function openGalleryLightbox(index, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (Date.now() < galleryLightboxReopenGuardUntil) return;

    currentLightboxIndex = index;
    const lightbox = document.getElementById('gallery-lightbox');
    const lightboxImage = document.getElementById('lightbox-image');

    if (lightbox && lightboxImage && photos[index]) {
        lightboxImage.src = photos[index].src;
        lightbox.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Lucide 아이콘 다시 초기화
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        if (!isGalleryLightboxState(window.history.state)) {
            const nextState = { ...(window.history.state || {}) };
            nextState[GALLERY_LIGHTBOX_HISTORY_KEY] = true;
            window.history.pushState(nextState, '', window.location.href);
        }
    }
}

// 갤러리 라이트박스 닫기
function closeGalleryLightbox(event, options = {}) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const { fromPopState = false } = options;
    const lightbox = document.getElementById('gallery-lightbox');
    if (!lightbox || lightbox.style.display !== 'flex') return;

    lightbox.style.display = 'none';
    document.body.style.overflow = '';
    galleryLightboxReopenGuardUntil = Date.now() + 350;

    if (!fromPopState && isGalleryLightboxState(window.history.state)) {
        window.history.back();
    }
}

// 라이트박스 네비게이션
function navigateLightbox(direction, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (photos.length === 0) return;

    const newIndex = currentLightboxIndex + direction;

    // 순환 네비게이션
    if (newIndex < 0) {
        currentLightboxIndex = photos.length - 1;
    } else if (newIndex >= photos.length) {
        currentLightboxIndex = 0;
    } else {
        currentLightboxIndex = newIndex;
    }

    const lightboxImage = document.getElementById('lightbox-image');
    if (lightboxImage && photos[currentLightboxIndex]) {
        lightboxImage.src = photos[currentLightboxIndex].src;
    }
}

// 라이트박스 스와이프 제스처
let lightboxTouchStartX = 0;
let lightboxTouchEndX = 0;

function initializeLightboxSwipe() {
    const lightbox = document.getElementById('gallery-lightbox');
    if (!lightbox) return;

    lightbox.addEventListener('touchstart', (e) => {
        lightboxTouchStartX = e.touches[0].clientX;
    }, { passive: true });

    lightbox.addEventListener('touchmove', (e) => {
        lightboxTouchEndX = e.touches[0].clientX;
    }, { passive: true });

    lightbox.addEventListener('touchend', () => {
        const swipeThreshold = 50;
        const swipeDistance = lightboxTouchEndX - lightboxTouchStartX;

        if (Math.abs(swipeDistance) > swipeThreshold) {
            if (swipeDistance > 0) {
                navigateLightbox(-1); // 이전
            } else {
                navigateLightbox(1); // 다음
            }
        }

        lightboxTouchStartX = 0;
        lightboxTouchEndX = 0;
    }, { passive: true });

    // 배경 클릭시 닫기
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeGalleryLightbox(e);
        }
    });

    // ESC 키로 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.style.display === 'flex') {
            closeGalleryLightbox();
        }
        if (e.key === 'ArrowLeft' && lightbox.style.display === 'flex') {
            navigateLightbox(-1);
        }
        if (e.key === 'ArrowRight' && lightbox.style.display === 'flex') {
            navigateLightbox(1);
        }
    });
}

// Q&A 아코디언 초기화
function initializeQnA() {
    if (!config) return;

    const accordion = document.getElementById('qna-accordion');
    const qnaData = config.qna;
    if (!accordion || !Array.isArray(qnaData) || qnaData.length === 0) return;

    accordion.innerHTML = qnaData.map(item => `
        <div class="accordion-item" data-id="${item.id}">
            <button class="accordion-header" onclick="toggleQnAItem(${item.id})">
                <span class="question">${item.question}</span>
                <span class="chevron">
                    <i data-lucide="chevron-down"></i>
                </span>
            </button>
            <div class="accordion-content collapsed">
                <div class="answer">${item.answer}</div>
            </div>
        </div>
    `).join('');

    reinitializeLucideIcons();
}

function toggleQnAItem(id) {
    const item = document.querySelector(`[data-id="${id}"]`);
    if (!item) return;
    const content = item.querySelector('.accordion-content');
    const chevron = item.querySelector('.chevron');
    if (!content || !chevron) return;

    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        content.classList.add('expanded');
        chevron.classList.add('rotated');
        item.classList.add('open');
    } else {
        content.classList.remove('expanded');
        content.classList.add('collapsed');
        chevron.classList.remove('rotated');
        item.classList.remove('open');
    }
}

// 범용 debounce 함수
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 배경음악 초기화 - 성능 최적화 (메타데이터만 먼저 로드)
function initializeBackgroundMusic() {
    if (!config || audio) return;

    audio = new Audio(config.assets.background_music);
    audio.loop = true;
    audio.volume = 0.3;
    audio.muted = isMuted;
    audio.preload = 'metadata'; // 메타데이터만 먼저 로드하여 초기 로딩 속도 개선

    audio.addEventListener('play', () => {
        isPlaying = true;
        updatePlayButton();
        saveUserMusicPreferences(); // 재생 상태 저장
        console.log('✅ 배경음악 재생 중');
    });

    audio.addEventListener('pause', () => {
        isPlaying = false;
        updatePlayButton();
        saveUserMusicPreferences(); // 일시정지 상태 저장
        console.log('⏸️ 배경음악 일시정지');
    });

    audio.addEventListener('error', (e) => {
        console.error('❌ 배경음악 로딩 실패:', e);
    });

    loadUserMusicPreferences();
    dockSpeakerControl();
    bindMusicStartOnFirstInteraction();

    document.addEventListener('wedding:intro-complete', () => {
        if (!isPlaying) {
            console.log('🎵 오프닝 종료 - 자동재생 재시도');
            tryAutoplay();
        }
    }, { once: true });

    // 즉시 로딩 시작 (재생은 하지 않음)
    audio.load();
    console.log('🎵 배경음악 로드 완료');

    const introOverlay = document.getElementById('intro-animation-overlay');
    const isIntroActive = introOverlay && introOverlay.style.display !== 'none';

    if (!isIntroActive) {
        tryAutoplay();
    } else if (getSavedMusicPlayingPreference() === 'true') {
        tryAutoplay();
    }

    // Fallback 3: 페이지 가시성 변경 시 자동 재생 (탭 전환, 페이지 재진입 등)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && audio && audio.readyState >= 2) {
            // 페이지가 다시 보이고, 음악이 재생 중이 아니며, 이전에 재생했었다면
            const savedPlaying = getSavedMusicPlayingPreference();
            if (!isPlaying && savedPlaying === 'true') {
                console.log('👁️ 페이지 다시 보임 - 음악 자동 재생 시도');
                tryAutoplay();
            }
        }
    });

    // Fallback 4: 페이지 포커스 시 자동 재생
    window.addEventListener('focus', () => {
        if (audio && audio.readyState >= 2 && !isPlaying) {
            const savedPlaying = getSavedMusicPlayingPreference();
            if (savedPlaying === 'true') {
                console.log('🔍 페이지 포커스 - 음악 자동 재생 시도');
                tryAutoplay();
            }
        }
    });
}

function getSavedMusicPlayingPreference() {
    try {
        return localStorage.getItem('wedding-music-playing');
    } catch (error) {
        console.log('localStorage 접근 실패:', error);
        return null;
    }
}

function shouldStartMusicOnInteraction() {
    return getSavedMusicPlayingPreference() !== 'false';
}

function unbindMusicStartOnFirstInteraction() {
    if (!bgmFirstInteractionHandler) return;
    window.removeEventListener('pointerdown', bgmFirstInteractionHandler, true);
    bgmFirstInteractionHandler = null;
}

function dockSpeakerControl() {
    const speakerControl = document.getElementById('bgm-speaker-control');
    if (!speakerControl) return;

    if (!speakerControl.classList.contains('detached')) {
        speakerControl.classList.add('detached');
        speakerControl.style.position = '';
        speakerControl.style.top = '';
        speakerControl.style.right = '';
        speakerControl.style.left = '';
        document.body.appendChild(speakerControl);
    }

    setTimeout(() => reinitializeLucideIcons(), 100);
}

function bindMusicStartOnFirstInteraction() {
    if (bgmFirstInteractionHandler) return;

    bgmFirstInteractionHandler = (event) => {
        unbindMusicStartOnFirstInteraction();

        const target = event.target;
        if (target && typeof target.closest === 'function' && target.closest('#bgm-speaker-button')) {
            return;
        }
        if (target && typeof target.closest === 'function' && target.closest('#intro-animation-overlay')) {
            return;
        }

        startBackgroundMusicFromUserGesture();
    };

    window.addEventListener('pointerdown', bgmFirstInteractionHandler, true);
}

function startBackgroundMusicFromUserGesture() {
    if (!config) {
        loadConfig();
    }

    if (!audio) {
        initializeBackgroundMusic();
    }

    unbindMusicStartOnFirstInteraction();

    if (!audio || isPlaying) return Promise.resolve(true);
    if (bgmAutoplayAttempt) return bgmAutoplayAttempt;

    if (!shouldStartMusicOnInteraction()) {
        console.log('🎵 이전에 음악을 껐기 때문에 자동 시작을 건너뜀');
        return Promise.resolve(false);
    }

    console.log('🎵 첫 사용자 인터랙션 감지 - 음악 재생 시도');
    bgmAutoplayAttempt = tryAutoplay().finally(() => {
        bgmAutoplayAttempt = null;
    });
    return bgmAutoplayAttempt;
}

function tryAutoplay() {
    if (!audio || isPlaying) return Promise.resolve(true);

    console.log('🎵 자동재생 시도...');
    return audio.play()
        .then(() => {
            console.log('✅ BGM 자동재생 성공!');
            isPlaying = true;
            updatePlayButton();
            showBGMNotification(); // 배너 표시
            return true;
        })
        .catch(error => {
            console.log('⚠️ 자동재생 실패 (브라우저 정책):', error.message);
            isPlaying = false;
            updatePlayButton();
            dockSpeakerControl();
            return false;
        });
}

// BGM 알림 배너 표시 함수
function showBGMNotification() {
    const banner = document.getElementById('bgm-notification-banner');
    if (!banner) return;

    dockSpeakerControl();
    banner.classList.add('show');
    console.log('🎵 BGM 알림 배너 표시');

    // Lucide 아이콘 재초기화
    setTimeout(() => reinitializeLucideIcons(), 100);

    if (bgmBannerHideTimeout) {
        clearTimeout(bgmBannerHideTimeout);
    }

    bgmBannerHideTimeout = setTimeout(() => {
        banner.classList.remove('show');
        console.log('🎵 BGM 알림 배너 숨김');
    }, 3000);
}

function toggleMusic() {
    if (!audio) return;

    if (isPlaying) {
        audio.pause();
    } else {
        audio.play().then(() => {
            console.log('✅ 사용자가 음악 재생');
            showBGMNotification();
        }).catch(error => {
            console.log('❌ 재생 실패:', error);
            alert('음악 재생에 실패했습니다. 다시 시도해주세요.');
        });
    }
}

function updatePlayButton() {
    // 기존 play-icon 업데이트 (하위 호환성)
    const playIcon = document.getElementById('play-icon');
    if (playIcon) {
        if (isPlaying) {
            playIcon.setAttribute('data-lucide', 'pause');
        } else {
            playIcon.setAttribute('data-lucide', 'play');
        }
    }

    // 스피커 아이콘 업데이트
    const speakerIcon = document.getElementById('bgm-speaker-icon');
    if (speakerIcon) {
        if (isPlaying) {
            speakerIcon.setAttribute('data-lucide', 'volume-2');
        } else {
            speakerIcon.setAttribute('data-lucide', 'volume-x');
        }
    }

    reinitializeLucideIcons();
}

function loadUserMusicPreferences() {
    try {
        const savedMuted = localStorage.getItem('wedding-music-muted');
        const savedPlaying = getSavedMusicPlayingPreference();

        if (savedMuted) {
            isMuted = savedMuted === 'true';
            if (audio) audio.muted = isMuted;
        }

        // 이전에 음악을 재생했었다면 자동재생을 더 적극적으로 시도
        if (savedPlaying === 'true') {
            console.log('🎵 이전 세션에서 음악 재생 이력 있음 - 자동재생 시도');
            autoplayPromptShown = true; // 사용자가 이미 음악을 들었음을 표시
        }
    } catch (error) {
        console.log('localStorage 접근 실패:', error);
    }
}

function saveUserMusicPreferences() {
    try {
        localStorage.setItem('wedding-music-muted', isMuted.toString());
        localStorage.setItem('wedding-music-playing', isPlaying.toString());
    } catch (error) {
        console.log('localStorage 저장 실패:', error);
    }
}

// 지도 라이트박스
function isMapLightboxState(state) {
    return Boolean(state && state[MAP_LIGHTBOX_HISTORY_KEY]);
}

function openMapLightbox(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (Date.now() < mapLightboxReopenGuardUntil) return;

    const lightbox = document.getElementById('map-lightbox');
    if (!lightbox) return;
    if (lightbox.style.display === 'flex') return;

    lightbox.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (!isMapLightboxState(window.history.state)) {
        const nextState = { ...(window.history.state || {}) };
        nextState[MAP_LIGHTBOX_HISTORY_KEY] = true;
        window.history.pushState(nextState, '', window.location.href);
    }
}

function closeMapLightbox(event, options = {}) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const { fromPopState = false } = options;
    const lightbox = document.getElementById('map-lightbox');
    if (!lightbox || lightbox.style.display !== 'flex') return;

    lightbox.style.display = 'none';
    document.body.style.overflow = '';
    mapLightboxReopenGuardUntil = Date.now() + 350;

    if (!fromPopState && isMapLightboxState(window.history.state)) {
        window.history.back();
    }
}

function openExternalMap(url, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    if (isMobile) {
        window.location.href = url;
        return;
    }

    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (popup) {
        popup.opener = null;
    } else {
        window.location.href = url;
    }
}

// 주소 복사
function copyAddress() {
    if (!config) return;

    const address = config.wedding.venue.full_address;
    navigator.clipboard.writeText(address)
        .then(() => showToast('주소가 복사되었습니다!'))
        .catch(err => console.error('주소 복사 실패:', err));
}

// 카카오 SDK 초기화 - defer 로딩
function initializeKakaoSDK() {
    const script = document.createElement('script');
    script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
    script.integrity = 'sha384-TiCUE00h649CAMonG018J2ujOgDKW/kVWlChEuu4jK2vxfAAD0eZxzCKakxg55G4';
    script.crossOrigin = 'anonymous';
    script.defer = true;

    script.onload = () => {
        if (window.Kakao && !window.Kakao.isInitialized()) {
            const kakaoAppKey = window.KAKAO_APP_KEY;
            if (kakaoAppKey && kakaoAppKey !== '') {
                window.Kakao.init(kakaoAppKey);
                console.log('카카오 SDK 초기화 완료');
            } else {
                console.warn('카카오 앱 키가 설정되지 않았습니다.');
            }
        }
    };

    script.onerror = () => {
        console.error('카카오 SDK 로드 실패');
    };

    document.head.appendChild(script);
}

// 공유 기능들
function shareToKakao() {
    if (!config) return;

    if (typeof window.Kakao === 'undefined') {
        showToast('카카오톡 공유 기능을 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
        return;
    }

    const shareConfig = config.content.share.kakao_share;

    try {
        window.Kakao.Share.sendDefault({
            objectType: 'feed',
            content: {
                title: shareConfig.title,
                description: shareConfig.description,
                imageUrl: config.content.meta.image,
                link: {
                    mobileWebUrl: window.location.href,
                    webUrl: window.location.href
                }
            },
            buttons: [
                {
                    title: shareConfig.button_title,
                    link: {
                        mobileWebUrl: window.location.href,
                        webUrl: window.location.href
                    }
                }
            ],
            installTalk: true
        });
    } catch (error) {
        console.error('카카오톡 공유 실패:', error);
        showToast('카카오톡 공유에 실패했습니다. 다시 시도해주세요.');
    }
}

async function copyLink() {
    try {
        const currentUrl = window.location.href;

        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(currentUrl);
            showToast('링크가 복사되었습니다! 💕');
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = currentUrl;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('링크가 복사되었습니다! 💕');
        }
    } catch (error) {
        console.error('링크 복사 실패:', error);
        showToast('링크 복사에 실패했습니다.');
    }
}

async function shareNative() {
    if (!config) return;

    const shareConfig = config.content.share.kakao_share;

    if (navigator.share) {
        try {
            await navigator.share({
                title: shareConfig.title,
                text: shareConfig.description.replace(/\\n/g, '\n'),
                url: window.location.href
            });
        } catch (error) {
            if (error.name !== 'AbortError') {
                copyLink();
            }
        }
    } else {
        copyLink();
    }
}

// 토스트 메시지
function showToast(message) {
    const toast = document.getElementById('share-toast');
    const toastMessage = document.getElementById('toast-message');

    toastMessage.textContent = message;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

// 키보드 이벤트 핸들러
function handleKeydown(event) {
    const galleryLightbox = document.getElementById('gallery-lightbox');
    const mapLightbox = document.getElementById('map-lightbox');

    const activeElement = document.activeElement;
    const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true'
    );

    if (event.key === 'Escape') {
        if (galleryLightbox && galleryLightbox.style.display === 'flex') {
            closeGalleryLightbox();
        } else if (mapLightbox && mapLightbox.style.display === 'flex') {
            closeMapLightbox();
        }
    } else if (event.key === ' ' && !isInputFocused) {
        event.preventDefault();
        toggleMusic();
    }
}

// 모달 오버레이 클릭 시 닫기
document.addEventListener('click', function(event) {
    const mapLightbox = document.getElementById('map-lightbox');

    if (event.target === mapLightbox) {
        closeMapLightbox(event);
    }
});

window.addEventListener('popstate', () => {
    const galleryLightbox = document.getElementById('gallery-lightbox');
    const mapLightbox = document.getElementById('map-lightbox');
    if (galleryLightbox && galleryLightbox.style.display === 'flex') {
        closeGalleryLightbox(null, { fromPopState: true });
    } else if (mapLightbox && mapLightbox.style.display === 'flex') {
        closeMapLightbox(null, { fromPopState: true });
    }
});

// 연락처 아코디언 토글 함수
function toggleParentsAccordion() {
    const content = document.getElementById('parents-content');
    const icon = document.getElementById('parents-accordion-icon');

    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        icon.classList.remove('rotated');
    } else {
        content.classList.add('expanded');
        icon.classList.add('rotated');
    }
}

// 페이드아웃 애니메이션 CSS 추가
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; transform: scale(1); }
        to { opacity: 0; transform: scale(0.8); }
    }
    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.02); box-shadow: 0 8px 25px rgba(185, 148, 147, 0.3); }
        100% { transform: scale(1); }
    }
`;
document.head.appendChild(style);

// =============================================================================
// 전역 함수 노출
// =============================================================================

window.openGalleryLightbox = openGalleryLightbox;
window.closeGalleryLightbox = closeGalleryLightbox;
window.navigateLightbox = navigateLightbox;
window.openMapLightbox = openMapLightbox;
window.closeMapLightbox = closeMapLightbox;
window.openExternalMap = openExternalMap;
window.toggleQnAItem = toggleQnAItem;
window.toggleMusic = toggleMusic;
window.startBackgroundMusicFromUserGesture = startBackgroundMusicFromUserGesture;
window.copyAddress = copyAddress;
window.shareToKakao = shareToKakao;
window.copyLink = copyLink;
window.shareNative = shareNative;
window.addToGoogleCalendar = addToGoogleCalendar;
window.toggleParentsAccordion = toggleParentsAccordion;

// ==================== 사진 업로드 ====================

let selectedFiles = [];

// 파일 선택 핸들러
function handleFileSelect(event) {
    const files = Array.from(event.target.files);

    if (files.length > 50) {
        showToast('한 번에 최대 50장까지 업로드할 수 있습니다.');
        event.target.value = '';
        return;
    }

    selectedFiles = files;
    displayFilePreview(files);
}

// 파일 미리보기 표시
function displayFilePreview(files) {
    const previewContainer = document.getElementById('file-preview');
    previewContainer.innerHTML = '';

    if (files.length === 0) {
        return;
    }

    const fileCount = document.createElement('div');
    fileCount.className = 'file-count';
    fileCount.textContent = `선택된 파일: ${files.length}개`;
    previewContainer.appendChild(fileCount);

    const previewGrid = document.createElement('div');
    previewGrid.className = 'preview-grid';

    files.forEach((file, index) => {
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.className = 'preview-image';
            previewItem.appendChild(img);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-preview-btn';
            removeBtn.innerHTML = '×';
            removeBtn.onclick = (event) => {
                event.preventDefault();
                removeFile(index);
            };
            previewItem.appendChild(removeBtn);
        };
        reader.readAsDataURL(file);

        previewGrid.appendChild(previewItem);
    });

    previewContainer.appendChild(previewGrid);
}

// 파일 제거
function removeFile(index) {
    selectedFiles.splice(index, 1);
    displayFilePreview(selectedFiles);

    // 파일 input 업데이트
    const fileInput = document.getElementById('photo-files');
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach(file => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;

    if (selectedFiles.length === 0) {
        fileInput.value = '';
    }
}

// 드래그 앤 드롭 처리
const fileUploadArea = document.getElementById('file-upload-area');

if (fileUploadArea) {
    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.classList.add('dragover');
    });

    fileUploadArea.addEventListener('dragleave', () => {
        fileUploadArea.classList.remove('dragover');
    });

    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('dragover');

        const files = Array.from(e.dataTransfer.files).filter(file =>
            file.type.startsWith('image/')
        );

        if (files.length > 50) {
            showToast('한 번에 최대 50장까지 업로드할 수 있습니다.');
            return;
        }

        const fileInput = document.getElementById('photo-files');
        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;

        selectedFiles = files;
        displayFilePreview(files);
    });
}

// 사진 업로드 폼 제출
const photoUploadForm = document.getElementById('photo-upload-form');

if (photoUploadForm) {
    photoUploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!PHOTO_UPLOAD_ENABLED) {
            showToast('사진 업로드 기능은 현재 비활성화되어 있습니다.');
            return;
        }

        if (selectedFiles.length === 0) {
            showToast('사진을 선택해주세요.');
            return;
        }

        const uploaderName = document.getElementById('uploader-name').value || '';
        const uploadButton = document.getElementById('photo-upload-button');
        const uploadProgress = document.getElementById('upload-progress');
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');

        // 버튼 비활성화 및 진행 상태 표시
        uploadButton.disabled = true;
        uploadButton.querySelector('#upload-button-text').textContent = '업로드 중...';
        uploadProgress.style.display = 'block';

        try {
            const formData = new FormData();
            selectedFiles.forEach(file => {
                formData.append('files', file);
            });
            formData.append('uploader_name', uploaderName);

            const response = await fetch('/photos/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                progressFill.style.width = '100%';
                progressText.textContent = '업로드 완료!';

                showToast(`${result.uploaded}장의 사진이 업로드되었습니다! ✨`);

                // 폼 리셋
                setTimeout(() => {
                    photoUploadForm.reset();
                    selectedFiles = [];
                    displayFilePreview([]);
                    uploadProgress.style.display = 'none';
                    progressFill.style.width = '0%';
                }, 2000);
            } else {
                throw new Error(result.detail || '업로드에 실패했습니다.');
            }
        } catch (error) {
            console.error('업로드 실패:', error);
            showToast('업로드 중 오류가 발생했습니다. 다시 시도해주세요.');
            uploadProgress.style.display = 'none';
        } finally {
            uploadButton.disabled = false;
            uploadButton.querySelector('#upload-button-text').textContent = '업로드';
        }
    });
}

window.handleFileSelect = handleFileSelect;

// ==================== Snaps 섹션 업로드 기능 ====================

// 업로드 허용 시작 시간 (한국시간 기준: 2026-08-08 12:00:00)
const UPLOAD_START_TIME_KST = new Date('2026-08-08T12:00:00+09:00');

/**
 * 현재 한국시간이 업로드 허용 시간인지 확인
 */
function isUploadAllowed() {
    const now = new Date();
    return now >= UPLOAD_START_TIME_KST;
}

/**
 * Snaps 업로드 버튼 및 안내 문구 상태 업데이트
 */
function updateSnapUploadStatus() {
    const uploadButton = document.querySelector('.snap-upload-button');
    const uploadNotice = document.getElementById('snap-upload-notice');

    if (!uploadButton || !uploadNotice) return;

    if (isUploadAllowed()) {
        // 업로드 가능 시간
        uploadButton.disabled = false;
        uploadButton.style.opacity = '1';
        uploadButton.style.cursor = 'pointer';
        uploadNotice.style.display = 'none';
    } else {
        // 업로드 불가 시간
        uploadButton.disabled = true;
        uploadButton.style.opacity = '0.5';
        uploadButton.style.cursor = 'not-allowed';
        uploadNotice.style.display = 'block';
    }
}

/**
 * Snaps 업로드 창 열기
 */
function openSnapUpload() {
    if (!PHOTO_UPLOAD_ENABLED) {
        showToast('사진 업로드 기능은 현재 비활성화되어 있습니다.');
        return;
    }

    // 한국시간 기준으로 업로드 허용 시간 체크
    if (!isUploadAllowed()) {
        showToast('2027년 11월 01일 12:00(한국시간)부터 업로드 가능합니다.');
        return;
    }

    const input = document.getElementById('snap-upload-input');
    if (input) {
        input.click();
    }
}

/**
 * Snaps 업로드 모달 닫기
 */
function closeSnapUploadModal() {
    const modal = document.getElementById('snap-upload-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Snaps 파일 선택 이벤트 핸들러 초기화
 */
function initializeSnapUpload() {
    const input = document.getElementById('snap-upload-input');
    if (!input) return;

    // 업로드 상태 초기화 (버튼 비활성화/활성화 및 안내 문구 표시)
    updateSnapUploadStatus();

    input.addEventListener('change', async function(e) {
        if (!PHOTO_UPLOAD_ENABLED) {
            showToast('사진 업로드 기능은 현재 비활성화되어 있습니다.');
            input.value = '';
            return;
        }

        const files = Array.from(e.target.files);

        if (files.length === 0) return;

        // 최대 50장 제한
        if (files.length > 50) {
            showToast('한 번에 최대 50장까지만 업로드할 수 있습니다.');
            return;
        }

        // 파일 크기 검증 (10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        const oversizedFiles = files.filter(file => file.size > maxSize);
        if (oversizedFiles.length > 0) {
            showToast(`파일 크기가 너무 큽니다. 최대 10MB까지 업로드 가능합니다.`);
            return;
        }

        // 모달 표시
        const modal = document.getElementById('snap-upload-modal');
        const progressBar = document.getElementById('snap-upload-progress');
        const statusText = document.getElementById('snap-upload-status');
        const closeBtn = document.getElementById('snap-upload-close');

        modal.style.display = 'flex';
        progressBar.style.width = '0%';
        statusText.textContent = `${files.length}장의 사진을 업로드하는 중...`;
        closeBtn.style.display = 'none';

        try {
            // FormData 생성
            const formData = new FormData();
            files.forEach(file => {
                formData.append('files', file);
            });
            formData.append('uploader_name', 'Guest'); // 익명 업로더

            // 업로드 요청
            const xhr = new XMLHttpRequest();

            // 진행률 업데이트
            xhr.upload.addEventListener('progress', function(e) {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    progressBar.style.width = percentComplete + '%';
                    statusText.textContent = `업로드 중... ${Math.round(percentComplete)}%`;
                }
            });

            // 업로드 완료
            xhr.addEventListener('load', function() {
                if (xhr.status === 200) {
                    const result = JSON.parse(xhr.responseText);
                    progressBar.style.width = '100%';

                    if (result.uploaded > 0) {
                        statusText.textContent = `✅ ${result.uploaded}장의 사진이 업로드되었습니다!`;
                        if (result.failed > 0) {
                            statusText.textContent += `\n⚠️ ${result.failed}장은 업로드에 실패했습니다.`;
                        }
                    } else {
                        statusText.textContent = '❌ 업로드에 실패했습니다.';
                    }

                    closeBtn.style.display = 'block';
                    // 입력 필드 초기화
                    input.value = '';
                } else {
                    progressBar.style.width = '0%';
                    statusText.textContent = '❌ 업로드에 실패했습니다. 다시 시도해주세요.';
                    closeBtn.style.display = 'block';
                    input.value = '';
                }
            });

            // 에러 처리
            xhr.addEventListener('error', function() {
                progressBar.style.width = '0%';
                statusText.textContent = '❌ 업로드 중 오류가 발생했습니다.';
                closeBtn.style.display = 'block';
                input.value = '';
            });

            // 요청 전송
            xhr.open('POST', '/photos/upload', true);
            xhr.send(formData);

        } catch (error) {
            console.error('업로드 에러:', error);
            progressBar.style.width = '0%';
            statusText.textContent = '❌ 업로드 중 오류가 발생했습니다.';
            closeBtn.style.display = 'block';
            input.value = '';
        }
    });
}

// Snaps 업로드 초기화를 페이지 로드 시 실행
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSnapUpload);
} else {
    initializeSnapUpload();
}

// 전역 함수로 노출
window.openSnapUpload = openSnapUpload;
window.closeSnapUploadModal = closeSnapUploadModal;

console.log('✅ 모든 전역 함수 노출 완료');

// iOS Safari pull-to-refresh 방지
(function preventPullToRefresh() {
    let lastTouchY = 0;
    document.addEventListener('touchstart', function(e) {
        lastTouchY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
        const touchY = e.touches[0].clientY;
        const scrollTop = document.body.scrollTop;
        if (scrollTop <= 0 && touchY > lastTouchY) {
            e.preventDefault();
        }
    }, { passive: false });
})();
