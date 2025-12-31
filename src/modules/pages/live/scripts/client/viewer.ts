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
        const FFMPEG_URL = 'https://maelsh.pro/ffmpeg';
        
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
        let fullyLoaded = false;
        
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
                
                // فحص حالة المنافسة من playlist
                const res = await fetch(FFMPEG_URL + '/playlist.php?id=' + competitionId);
                if (!res.ok) {
                    throw new Error('Competition not found');
                }
                
                const data = await res.json();
                
                // تحديد النوع: live أو VOD
                if (data.is_live) {
                    log('🔴 Live stream detected!', 'info');
                    await startLiveStream(competitionId);
                } else {
                    log('📼 Recorded video detected (' + data.chunks.length + ' chunks)', 'info');
                    await loadVOD(competitionId, data);
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
                }
            });
            
            await currentPlayer.start();
            updateStatus('🔴 ${tr.live}', 'green');
            currentMode = 'live';
        }
        
        // ===== Load VOD =====
        async function loadVOD(competitionId, playlistData) {
            stopStreamInternal();
            
            setMode('vod', '📼 VOD');
            document.getElementById('viewerSubtitle').textContent = '${tr.recorded}';
            
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
                    
                    // إظهار أزرار التحميل فقط بعد اكتمال التحميل
                    if (currentPlayer && currentPlayer.isFullyLoaded() && !fullyLoaded) {
                        fullyLoaded = true;
                        log('✅ All chunks loaded!', 'success');
                        showDownloadButtons(currentPlayer.extension);
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
            currentMode = 'vod';
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
        
        // ===== Show Download Buttons (only after fully loaded) =====
        function showDownloadButtons(extension) {
            const container = document.getElementById('downloadContainer');
            if (!container) return;
            
            container.innerHTML = '';
            container.classList.remove('hidden');
            
            // زر تحميل مباشر
            const directBtn = document.createElement('button');
            directBtn.className = 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2';
            directBtn.innerHTML = '<i class="fas fa-download"></i> ' + extension.toUpperCase();
            directBtn.onclick = async function() {
                directBtn.disabled = true;
                directBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                try {
                    await currentPlayer.downloadVideo();
                } catch (e) {
                    log('❌ Download failed: ' + e.message, 'error');
                }
                directBtn.disabled = false;
                directBtn.innerHTML = '<i class="fas fa-download"></i> ' + extension.toUpperCase();
            };
            container.appendChild(directBtn);
            
            // زر MP4 إذا كان WebM
            if (extension === 'webm') {
                const mp4Btn = document.createElement('button');
                mp4Btn.className = 'px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2';
                mp4Btn.innerHTML = '<i class="fas fa-file-video"></i> MP4';
                mp4Btn.onclick = async function() {
                    mp4Btn.disabled = true;
                    mp4Btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    try {
                        await currentPlayer.downloadAsMp4(null, function(stage) {
                            if (stage === 'loading') mp4Btn.innerHTML = '<i class="fas fa-download"></i> FFmpeg...';
                            else if (stage === 'converting') mp4Btn.innerHTML = '<i class="fas fa-cog fa-spin"></i> ${tr.converting}...';
                        });
                    } catch (e) {
                        log('❌ Conversion failed: ' + e.message, 'error');
                    }
                    mp4Btn.disabled = false;
                    mp4Btn.innerHTML = '<i class="fas fa-file-video"></i> MP4';
                };
                container.appendChild(mp4Btn);
            }
        }
        
        // ===== Stop Stream Internal =====
        function stopStreamInternal() {
            fullyLoaded = false;
            
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
