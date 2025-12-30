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
        const { ChunkManager, LiveSequentialPlayer, VodMsePlayer, SmartVodPlayer, testLog: log, updateStatus, setMode } = window;
        
        // Elements
        const videoPlayers = [
            document.getElementById('videoPlayer1'),
            document.getElementById('videoPlayer2')
        ];
        
        // قراءة رقم المنافسة من URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlCompId = urlParams.get('comp');
        if (urlCompId) {
            document.getElementById('compIdInput').value = urlCompId;
        }
        
        // Global state
        let currentPlayer = null;
        let chunkManager = null;
        let currentMode = null;
        
        // ===== Start MSE Stream =====
        window.startMSEStream = async function() {
            const compIdInput = document.getElementById('compIdInput');
            const competitionId = compIdInput.value.trim();
            
            if (!competitionId) {
                log('${tr.enter_number}!', 'error');
                updateStatus('${tr.enter_number}!', 'red');
                return;
            }
            
            try {
                stopStreamInternal();
                
                log('${tr.live}: ' + competitionId);
                updateStatus('${tr.loading}', 'yellow');
                setMode('mse', 'MSE Live');
                
                chunkManager = new ChunkManager(competitionId, 'webm');
                
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
                updateStatus('${tr.live} ✓', 'green');
                currentMode = 'live';
                
            } catch (error) {
                log('${tr.error}: ' + error.message, 'error');
                updateStatus('${tr.error}', 'red');
            }
        }
        
        // ===== Load VOD (Smart) =====
        window.loadVOD = async function() {
            const compIdInput = document.getElementById('compIdInput');
            const competitionId = compIdInput.value.trim();
            
            if (!competitionId) {
                log('${tr.enter_number}!', 'error');
                updateStatus('${tr.enter_number}!', 'red');
                return;
            }
            
            try {
                stopStreamInternal();
                
                log('📼 ${tr.recorded}: ' + competitionId);
                updateStatus('${tr.loading}', 'yellow');
                setMode('vod', 'Smart VOD');
                
                // استخدام SmartVodPlayer الجديد
                currentPlayer = new SmartVodPlayer({
                    videoElement: videoPlayers[0],
                    competitionId: competitionId,
                    onProgress: function(current, total) {
                        document.getElementById('statsInfo').textContent = 
                            '▶️ Chunk ' + current + '/' + total;
                    },
                    onChunkLoaded: function(index, loaded) {
                        log('📦 Chunk ' + (index + 1) + ' preloaded (' + loaded + ' total)', 'info');
                        // تحديث عداد التحميل
                        const loadingInfo = document.getElementById('vodLoadingInfo');
                        if (loadingInfo && currentPlayer) {
                            loadingInfo.textContent = '📦 ' + loaded + '/' + currentPlayer.chunks.length;
                        }
                    },
                    onReady: function(info) {
                        log('✅ Ready: ' + info.chunks + ' chunks, ' + Math.round(info.totalDuration) + 's (' + info.extension + ')', 'success');
                        updateStatus('${tr.recorded} ✓ (' + info.extension.toUpperCase() + ')', 'green');
                        
                        // إظهار VOD Controls
                        const vodControls = document.getElementById('vodControls');
                        if (vodControls) vodControls.classList.remove('hidden');
                        
                        // ربط seekbar
                        setupSeekbar();
                        
                        // إظهار زر التحميل
                        showDownloadButton(info.extension);
                    },
                    onError: function(error) {
                        log('❌ ' + error.message, 'error');
                        updateStatus('${tr.error}', 'red');
                    }
                });
                
                await currentPlayer.start();
                currentMode = 'vod';
                
            } catch (error) {
                log('${tr.error}: ' + error.message, 'error');
                updateStatus('${tr.error}', 'red');
            }
        }
        
        // ===== Setup Seekbar =====
        function setupSeekbar() {
            const seekbar = document.getElementById('vodSeekbar');
            if (!seekbar || !currentPlayer) return;
            
            // عند تحريك seekbar
            seekbar.addEventListener('input', function() {
                if (!currentPlayer || !currentPlayer.totalDuration) return;
                const percent = parseFloat(seekbar.value);
                const targetTime = (percent / 100) * currentPlayer.totalDuration;
                currentPlayer.seekTo(targetTime);
            });
        }
        
        // ===== Show Download Button =====
        function showDownloadButton(extension) {
            // إزالة زر قديم إذا موجود
            const existingBtn = document.getElementById('downloadBtn');
            if (existingBtn) existingBtn.remove();
            
            // إنشاء container للأزرار
            const container = document.createElement('div');
            container.id = 'downloadBtn';
            container.className = 'mt-4 flex flex-wrap justify-center gap-2';
            
            // زر تحميل مباشر
            const directBtn = document.createElement('button');
            directBtn.className = 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2';
            directBtn.innerHTML = '<i class="fas fa-download"></i> ${tr.download} (' + extension.toUpperCase() + ')';
            directBtn.onclick = async function() {
                directBtn.disabled = true;
                directBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ${tr.loading}...';
                try {
                    await currentPlayer.downloadVideo();
                } catch (e) {
                    log('❌ Download failed: ' + e.message, 'error');
                }
                directBtn.disabled = false;
                directBtn.innerHTML = '<i class="fas fa-download"></i> ${tr.download} (' + extension.toUpperCase() + ')';
            };
            container.appendChild(directBtn);
            
            // زر تحويل لـ MP4 إذا كان WebM
            if (extension === 'webm') {
                const convertBtn = document.createElement('button');
                convertBtn.className = 'px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2';
                convertBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> ${tr.download} MP4';
                convertBtn.onclick = async function() {
                    convertBtn.disabled = true;
                    convertBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ${tr.converting}...';
                    try {
                        await currentPlayer.downloadAsMp4(null, function(stage, progress) {
                            if (stage === 'loading') convertBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading FFmpeg...';
                            else if (stage === 'converting') convertBtn.innerHTML = '<i class="fas fa-cog fa-spin"></i> Converting...';
                        });
                    } catch (e) {
                        log('❌ Conversion failed: ' + e.message, 'error');
                    }
                    convertBtn.disabled = false;
                    convertBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> ${tr.download} MP4';
                };
                container.appendChild(convertBtn);
            }
            
            // إضافة للصفحة
            const logContainer = document.getElementById('logContainer');
            if (logContainer) {
                logContainer.parentNode.insertBefore(container, logContainer);
            }
        }
        
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
            
            // إزالة أزرار التحميل
            const downloadBtn = document.getElementById('downloadBtn');
            if (downloadBtn) downloadBtn.remove();
            
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

