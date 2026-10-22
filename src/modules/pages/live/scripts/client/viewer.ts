/**
 * Viewer Page Client Script
 * الـ JavaScript الخاص بصفحة المشاهد
 */

import type { Language } from '../../../../../config/types';
import { translations, getUILanguage } from '../../../../../i18n';

/**
 * Get Viewer Script - توليد الـ JavaScript الخاص بصفحة المشاهد
 */
export function getViewerScript(lang: Language): string {
    const tr = translations[getUILanguage(lang)];

    return `
        (function() {
        // ===== Viewer Page Script =====
        const { ChunkManager, LiveSequentialPlayer, SmartVodPlayer, testLog: log, updateStatus, setMode } = window;
        const FFMPEG_URL = 'https://maelshpro.com/ffmpeg';
        
        // Elements
        const videoPlayers = [
            document.getElementById('videoPlayer1'),
            document.getElementById('videoPlayer2')
        ];
        const videoContainer = document.getElementById('videoContainer');
        
        // قراءة رقم المنافسة من URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlCompId = urlParams.get('comp');
        if (urlCompId) {
            document.getElementById('compIdInput').value = urlCompId;
            // بدء تلقائي إذا جاء من URL
            setTimeout(function() { window.checkAndLoad(); }, 500);
        }
        
        // Global state
        let currentPlayer = null;
        let chunkManager = null;
        let currentMode = null;
        // The download button is rendered outside loadVOD's parameter scope, so
        // retain the competition id it belongs to.
        let currentCompetitionId = null;

        
        // ===== Check Competition Status and Load =====
        window.checkAndLoad = async function() {
            const compIdInput = document.getElementById('compIdInput');
            const competitionId = compIdInput.value.trim();
            
            if (!competitionId) {
                log('${tr.enter_number}!', 'error');
                updateStatus('${tr.enter_number}!', 'red');
                return;
            }
            
            try {
                updateStatus('${tr.loading}...', 'yellow');
                log('🔍 Checking competition #' + competitionId + '...', 'info');
                
                // 1. جلب حالة المنافسة من API الرئيسي (قاعدة البيانات)
                const compRes = await fetch('/api/competitions/' + competitionId);
                if (!compRes.ok) {
                    throw new Error('Competition not found');
                }
                const compData = await compRes.json();
                const competition = compData.data || compData;
                
                log('📋 Competition: ' + competition.title, 'info');
                log('📊 Status: ' + competition.status + ', Stream: ' + (competition.stream_status || 'idle'), 'info');
                
                // تحديد النوع من حالة المنافسة في قاعدة البيانات
                const isLive = competition.status === 'live' || competition.stream_status === 'live';
                
                if (isLive) {
                    log('🔴 Live stream!', 'success');
                    await startLiveStream(competitionId);
                } else if (competition.status === 'completed' || competition.stream_status === 'ready') {
                    log('📼 Recorded video', 'success');
                    
                    // 2. جلب playlist عبر وكيل السيرفر (T1.3: CORS-safe)
                    const playlistRes = await fetch('/api/chunks/playlist/' + competitionId);
                    if (!playlistRes.ok) {
                        throw new Error('Video not available');
                    }
                    const playlistData = await playlistRes.json();
                    await loadVOD(competitionId, playlistData);
                } else {
                    log('⏳ Competition not started yet', 'warn');
                    updateStatus('${tr.waiting}', 'yellow');
                }
                
            } catch (error) {
                log('❌ ' + error.message, 'error');
                updateStatus('${tr.error}', 'red');
            }
        }
        
        // ===== Start Live Stream =====
        async function startLiveStream(competitionId) {
            stopStreamInternal();
            
            setMode('mse', '🔴 LIVE');
            document.getElementById('viewerSubtitle').textContent = '${tr.live}';
            
            chunkManager = new ChunkManager(competitionId, 'mp4');
            
            currentPlayer = new LiveSequentialPlayer({
                videoPlayers: videoPlayers,
                chunkManager: chunkManager,
                onChunkChange: function(index, total) {
                    document.getElementById('statsInfo').textContent = 
                        '${tr.chunks}: ' + index + (total > 0 ? '/' + total : '');
                },
                onStatus: function(status) {
                    log(status, 'info');
                },
                onError: function(error) {
                    log('${tr.error}: ' + error.message, 'error');
                    updateStatus('${tr.error}', 'red');
                },
                // R4-CHUNK-VIEW-RECOVERY-1 (28.4): a finalized recording with no
                // playable clip ends the live player cleanly (no eternal
                // spinner). Reflect that here instead of flipping to LIVE.
                onStreamEnd: function() {
                    log('Recording ended', 'info');
                    try { currentPlayer && currentPlayer.stop && currentPlayer.stop(); } catch (e) {}
                }
            });

            await currentPlayer.start();
            // Only claim LIVE when the player is actually still running; a
            // recording that ended before any playable clip did NOT start live.
            if (currentPlayer && currentPlayer.isRunning) {
                updateStatus('🔴 ${tr.live}', 'green');
                currentMode = 'live';
            } else {
                updateStatus('📼 ${tr.recorded}', 'yellow');
            }
        }
        
        // ===== Load VOD =====
        async function loadVOD(competitionId, playlistData) {
            stopStreamInternal();
            currentCompetitionId = String(competitionId);
            
            setMode('vod', '📼 VOD');
            currentMode = 'vod';
            document.getElementById('viewerSubtitle').textContent = '${tr.recorded}';

            // The download dialog owns its own server manifest + chunk fetch;
            // it must be available before (or without) the player loading every
            // chunk. Guests still get no button.
            showDownloadButtons();
            
            // إظهار VOD Controls
            const vodControls = document.getElementById('vodControls');
            if (vodControls) vodControls.classList.remove('hidden');
            
            currentPlayer = new SmartVodPlayer({
                videoElement: videoPlayers[0],
                competitionId: competitionId,
                playlistData: playlistData, // تمرير البيانات المحملة مسبقاً
                onProgress: function(current, total) {
                    document.getElementById('statsInfo').textContent = 
                        '▶️ ' + current + '/' + total;
                },
                onChunkLoaded: function(index, loaded) {
                    const loadingInfo = document.getElementById('vodLoadingInfo');
                    if (loadingInfo && currentPlayer) {
                        loadingInfo.textContent = loaded + '/' + currentPlayer.chunks.length;
                    }
                },
                onReady: function(info) {
                    log('✅ Ready: ' + info.chunks + ' chunks, ' + Math.round(info.totalDuration) + 's', 'success');
                    updateStatus('📼 ' + info.extension.toUpperCase(), 'green');
                    setupControls();
                },
                onError: function(error) {
                    log('❌ ' + error.message, 'error');
                    updateStatus('${tr.error}', 'red');
                }
            });
            
            await currentPlayer.start();
        }
        
        // ===== Setup VOD Controls =====
        function setupControls() {
            const seekbar = document.getElementById('vodSeekbar');
            const video = videoPlayers[0];
            
            if (seekbar && currentPlayer) {
                // عند تحريك seekbar
                seekbar.addEventListener('input', function() {
                    if (!currentPlayer || !currentPlayer.totalDuration) return;
                    const percent = parseFloat(seekbar.value);
                    const targetTime = (percent / 100) * currentPlayer.totalDuration;
                    currentPlayer.seekTo(targetTime);
                });
            }
            
            // تحديث أيقونة play/pause
            if (video) {
                video.addEventListener('play', updatePlayPauseIcon);
                video.addEventListener('pause', updatePlayPauseIcon);
            }
        }
        
        function updatePlayPauseIcon() {
            const icon = document.getElementById('playPauseIcon');
            const video = videoPlayers[0];
            if (icon && video) {
                icon.className = video.paused ? 'fas fa-play' : 'fas fa-pause';
            }
        }
        
        // ===== Toggle Play/Pause =====
        window.togglePlayPause = function() {
            const video = videoPlayers[0];
            if (!video) return;
            
            if (video.paused) {
                video.play();
            } else {
                video.pause();
            }
        }
        
        // ===== Toggle Fullscreen =====
        window.toggleVideoFullscreen = function() {
            if (!videoContainer) return;
            
            if (!document.fullscreenElement) {
                if (videoContainer.requestFullscreen) {
                    videoContainer.requestFullscreen();
                } else if (videoContainer.webkitRequestFullscreen) {
                    videoContainer.webkitRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
        }
        
        document.addEventListener('fullscreenchange', function() {
            const icon = document.getElementById('fullscreenIcon');
            if (icon) {
                icon.className = document.fullscreenElement ? 'fas fa-compress' : 'fas fa-expand';
            }
        });
        
        // ===== Show Download Button (R4-CHUNK-DOWNLOAD-1) =====
        // Guests may watch the recording but get no download button. Signed-in
        // users open the independent download dialog, which fetches the
        // authenticated server manifest and never depends on loadedChunks.
        function showDownloadButtons() {
            const container = document.getElementById('downloadContainer');
            if (!container) return;

            container.innerHTML = '';
            if (!window.currentUser || !window.currentUser.id) {
                container.classList.add('hidden');
                return;
            }
            container.classList.remove('hidden');

            const mp4Btn = document.createElement('button');
            mp4Btn.type = 'button';
            mp4Btn.className = 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2';
            mp4Btn.setAttribute('aria-label', '${tr.download_ui.title}');
            const icon = document.createElement('i');
            icon.className = 'fas fa-download';
            icon.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.textContent = '${tr.download_ui.start}';
            mp4Btn.append(icon, label);
            mp4Btn.onclick = function() {
                if (typeof window.openRecordingDownload === 'function' && currentCompetitionId) {
                    window.openRecordingDownload(currentCompetitionId);
                }
            };
            container.appendChild(mp4Btn);
        }
        window.addEventListener('dueli:auth-success', function() {
            if (currentMode === 'vod') showDownloadButtons();
        });
        
        // ===== Stop Stream Internal =====
        function stopStreamInternal() {
            if (currentPlayer) {
                if (currentPlayer.destroy) {
                    currentPlayer.destroy();
                } else if (currentPlayer.stop) {
                    currentPlayer.stop();
                }
                currentPlayer = null;
            }
            
            videoPlayers.forEach(function(v) {
                v.src = '';
                v.load();
            });
            
            // إخفاء VOD Controls
            const vodControls = document.getElementById('vodControls');
            if (vodControls) vodControls.classList.add('hidden');
            
            // إخفاء وتنظيف أزرار التحميل
            const downloadContainer = document.getElementById('downloadContainer');
            if (downloadContainer) {
                downloadContainer.innerHTML = '';
                downloadContainer.classList.add('hidden');
            }
            
            setMode('', '');
            currentMode = null;
            currentCompetitionId = null;
        }
        
        // ===== Stop Stream (Public) =====
        window.stopStream = function() {
            stopStreamInternal();
            updateStatus('${tr.stop_watching}', 'gray');
        }
        
        // Init
        log('${tr.page_loaded}');
        updateStatus('${tr.enter_comp_to_watch}', 'blue');
        })();
    `;
}
