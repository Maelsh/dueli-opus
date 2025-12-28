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
        // ===== Viewer Page Script =====
        const { ChunkManager, LiveSequentialPlayer, VodMsePlayer, testLog: log, updateStatus, setMode } = window;
        
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
        
        // ===== Load VOD =====
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
                
                log('${tr.recorded}: ' + competitionId);
                updateStatus('${tr.loading}', 'yellow');
                setMode('vod', 'VOD');
                
                chunkManager = new ChunkManager(competitionId, 'webm');
                
                currentPlayer = new VodMsePlayer({
                    videoElement: videoPlayers[0],
                    chunkManager: chunkManager,
                    onProgress: function(current, total) {
                        document.getElementById('statsInfo').textContent = 
                            '${tr.loading}: ' + current + '/' + total;
                    }
                });
                
                await currentPlayer.start();
                updateStatus('${tr.recorded} ✓', 'green');
                currentMode = 'vod';
                
            } catch (error) {
                log('${tr.error}: ' + error.message, 'error');
                updateStatus('${tr.error}', 'red');
            }
        }
        
        // ===== Stop Stream Internal =====
        function stopStreamInternal() {
            if (currentPlayer) {
                currentPlayer.stop();
                currentPlayer = null;
            }
            
            videoPlayers.forEach(function(v) {
                v.src = '';
                v.load();
            });
            
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
    `;
}
