/**
 * Host Page Client Script
 * الـ JavaScript الخاص بصفحة المضيف
 */

import { STREAM_SERVER_URL, TEST_ROOM_ID, FFMPEG_URL, ICE_SERVERS } from '../server/core';
import type { Language } from '../../../../../config/types';
import { translations, getUILanguage, isRTL } from '../../../../../i18n';

/**
 * Get Host Script - توليد الـ JavaScript الخاص بصفحة المضيف
 */
export function getHostScript(lang: Language): string {
    const uiLang = getUILanguage(lang);
    const tr = translations[uiLang];
    const isRightToLeft = isRTL(uiLang); // Use global isRTL helper
    const iceServersJson = JSON.stringify(ICE_SERVERS);

    return `
        (function() {
        // ===== Host Page Script =====
        // استيراد الوظائف من window التي تم تعريفها في shared.ts
        const { testLog: log, updateStatus, detectDeviceCapabilities, qualityPresets, toggleFullscreen, toggleLocalVideoVisibility, updateConnectionButtons } = window;
        
        // اختصار للحالة المشتركة
        const ms = window.mediaState;
        
        const roomId = '${TEST_ROOM_ID}';
        const role = 'host';
        const streamServerUrl = '${STREAM_SERVER_URL}';
        const ffmpegUrl = '${FFMPEG_URL}';
        const iceServers = ${iceServersJson};
        
        // Local state (only for host-specific logic unrelated to connection state)
        let remoteStream = new MediaStream();
        let mediaRecorder = null;
        let chunkIndex = 0;
        // تخزين ICE candidates حتى يتم setRemoteDescription
        let pendingIceCandidates = [];
        let hasRemoteDescription = false;
        
        // قراءة رقم المنافسة من URL أو إنشاء عشوائي
        const urlParams = new URLSearchParams(window.location.search);
        let competitionId = urlParams.get('comp') ? parseInt(urlParams.get('comp')) : Math.floor(Math.random() * 900000 + 100000);
        
        if (!urlParams.get('comp')) {
            history.replaceState(null, '', window.location.pathname + '?comp=' + competitionId + '&lang=${lang}');
        }
        
        // إظهار رقم المنافسة مع الروابط
        const baseUrl = window.location.origin;
        const guestLink = baseUrl + '/live/guest?comp=' + competitionId + '&lang=${lang}';
        const viewerLink = baseUrl + '/live/viewer?comp=' + competitionId + '&lang=${lang}';
        
        document.getElementById('compIdDisplay').innerHTML = 
            '${tr.competition_number}: <strong>' + competitionId + '</strong><br>' +
            '<small class="text-gray-600 dark:text-gray-400">' +
            '👤 <a href="' + guestLink + '" class="text-blue-600 dark:text-blue-400 hover:underline" target="_blank">${tr.guest}</a> | ' +
            '👁️ <a href="' + viewerLink + '" class="text-purple-600 dark:text-purple-400 hover:underline" target="_blank">${tr.viewer}</a>' +
            '</small>';
        
        log('${tr.page_loaded} - ${tr.competition_number}: ' + competitionId);
        
        // Quality & Recording state
        const localQualityPresets = qualityPresets || {
            excellent: { name: 'Excellent', width: 1280, height: 360, fps: 30, segment: 4000, bitrate: 2000000 },
            good:      { name: 'Good', width: 854,  height: 240, fps: 24, segment: 6000, bitrate: 1000000 },
            medium:    { name: 'Medium', width: 640,  height: 180, fps: 15, segment: 10000, bitrate: 500000 },
            low:       { name: 'Low', width: 426,  height: 120, fps: 10, segment: 20000, bitrate: 250000 },
            minimal:   { name: 'Minimal', width: 320,  height: 90,  fps: 10, segment: 30000, bitrate: 150000 }
        };
        
        let currentQuality = localQualityPresets.medium;
        let uploadQueue = [];
        let isUploading = false;
        let segmentInterval = null;
        let drawInterval = null;
        let droppedChunks = 0;
        let uploadStartTime = 0;
        let lastLatency = 0;
        let probeResults = null;
        
        // ===== Device Probing =====
        async function probeDevice() {
            log('🔍 Testing device capabilities...');
            const results = { cpuScore: 0, canvasFps: 0, networkSpeed: 0 };
            
            // 1. CPU test
            const cpuStart = performance.now();
            let iterations = 0;
            while (performance.now() - cpuStart < 500) {
                Math.random() * Math.random();
                iterations++;
            }
            results.cpuScore = Math.round(iterations / 10000);
            log('CPU Score: ' + results.cpuScore);
            
            // 2. Canvas FPS test
            const testCanvas = document.createElement('canvas');
            testCanvas.width = 640;
            testCanvas.height = 360;
            const testCtx = testCanvas.getContext('2d');
            
            let frames = 0;
            const fpsStart = performance.now();
            while (performance.now() - fpsStart < 1000) {
                testCtx.fillStyle = 'rgb(' + Math.random()*255 + ',' + Math.random()*255 + ',' + Math.random()*255 + ')';
                testCtx.fillRect(0, 0, 640, 360);
                frames++;
            }
            results.canvasFps = frames;
            log('Canvas FPS: ' + results.canvasFps);
            
            // 3. Network speed test
            try {
                const testBlob = new Blob([new Uint8Array(50000)]);
                const uploadStart = performance.now();
                await fetch(ffmpegUrl + '/upload.php', {
                    method: 'POST',
                    body: (function() {
                        const fd = new FormData();
                        fd.append('chunk', testBlob, 'speedtest.bin');
                        fd.append('competition_id', 'speedtest');
                        fd.append('chunk_number', '0');
                        fd.append('extension', 'bin');
                        return fd;
                    })()
                });
                const uploadTime = performance.now() - uploadStart;
                results.networkSpeed = Math.round(50000 / (uploadTime / 1000));
                log('Network: ' + Math.round(results.networkSpeed / 1024) + ' KB/s');
            } catch (e) {
                results.networkSpeed = 50000;
            }
            
            return results;
        }
        
        // ===== Quality Selection =====
        function selectQuality(probe) {
            if (probe.cpuScore > 80 && probe.canvasFps > 100 && probe.networkSpeed > 200000) {
                return localQualityPresets.excellent;
            } else if (probe.cpuScore > 50 && probe.canvasFps > 60 && probe.networkSpeed > 100000) {
                return localQualityPresets.good;
            } else if (probe.cpuScore > 30 && probe.canvasFps > 30 && probe.networkSpeed > 50000) {
                return localQualityPresets.medium;
            } else if (probe.cpuScore > 15) {
                return localQualityPresets.low;
            } else {
                return localQualityPresets.minimal;
            }
        }
        
        // ===== Downgrade Quality =====
        function downgradeQuality() {
            const levels = Object.keys(localQualityPresets);
            const currentIndex = levels.indexOf(Object.keys(localQualityPresets).find(function(k) { return localQualityPresets[k] === currentQuality; }));
            
            if (currentIndex < levels.length - 1) {
                currentQuality = localQualityPresets[levels[currentIndex + 1]];
                log('📉 Quality downgraded to: ' + currentQuality.name, 'warn');
                updateQualityInfo();
            }
        }
        
        // ===== Update Latency Gauge =====
        function updateLatencyGauge(latency) {
            const gauge = document.getElementById('latencyGauge');
            if (!gauge) return;
            
            let color = 'green';
            let status = 'Excellent';
            
            if (latency > 15000) {
                color = 'red';
                status = 'Bad';
            } else if (latency > 5000) {
                color = 'yellow';
                status = 'Medium';
            }
            
            gauge.innerHTML = '<span class="text-' + color + '-400">● ' + status + ' (' + Math.round(latency/1000) + 's)</span>';
        }
        
        // ===== Validate Chunk =====
        function validateChunk(blob, index) {
            if (blob.size < 1024) {
                return { valid: false, reason: 'Chunk too small (<1KB)' };
            }
            if (blob.size > 50 * 1024 * 1024) {
                return { valid: false, reason: 'Chunk too large (>50MB)' };
            }
            if (!blob.type || !blob.type.includes('video')) {
                return { valid: false, reason: 'Invalid type (not video)' };
            }
            try {
                const testUrl = URL.createObjectURL(blob);
                URL.revokeObjectURL(testUrl);
            } catch (e) {
                return { valid: false, reason: 'Chunk corrupted' };
            }
            return { valid: true };
        }
        
        // ===== Handle Connection Failure =====
        function handleConnectionFailure() {
            log('🔄 Cleaning failed connection...', 'warn');
            
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            mediaRecorder = null;
            
            if (ms.pc) {
                ms.pc.close();
                ms.pc = null;
            }
            
            if (ms.pollingInterval) {
                clearInterval(ms.pollingInterval);
                ms.pollingInterval = null;
            }
            
            log('✅ Ready to reconnect - press connect', 'info');
        }
        
        // ===== Get Last Chunk Index =====
        async function getLastChunkIndex() {
            try {
                const res = await fetch(ffmpegUrl + '/playlist.php?id=' + competitionId);
                if (res.ok) {
                    const data = await res.json();
                    if (data.chunks && data.chunks.length > 0) {
                        const lastIndex = data.chunks.length;
                        log('📊 Last chunk on server: ' + lastIndex, 'info');
                        return lastIndex;
                    }
                }
            } catch (e) {
                log('⚠️ Could not get last index - Starting from 0', 'warn');
            }
            return 0;
        }
        
        // ===== Connection =====
        let signalingManager = null;
        
        async function createRoom() {
            try {
                log('${tr.loading}...');
                const token = window.getSessionToken();
                if (!token) {
                    log('❌ يجب تسجيل الدخول أولاً', 'error');
                    return false;
                }
                
                const res = await fetch(streamServerUrl + '/api/signaling/room/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ competition_id: competitionId.toString() })
                });
                const data = await res.json();
                if (data.success && data.data.room_id) {
                    window.actualRoomId = data.data.room_id;
                    return { roomId: data.data.room_id, token };
                }
                return false;
            } catch (err) {
                log('${tr.error}: ' + err.message, 'error');
                return false;
            }
        }
        
        // Flag to prevent double clicks
        let isConnecting = false;

        window.connect = async function() {
            if (isConnecting) {
                console.log('[DEBUG] Already connecting, ignoring click');
                return;
            }
            console.log('[DEBUG] window.connect called');
            console.log('[DEBUG] ms.localStream:', ms.localStream);
            
            if (!ms.localStream) {
                log('${tr.share_screen}!', 'warn');
                console.log('[DEBUG] No localStream - exiting connect');
                return;
            }
            
            isConnecting = true;
            updateStatus('${tr.connect}...', 'yellow');
            
            // Disable button visually to prevent confusion
            const btn = document.getElementById('connectBtn');
            if (btn) btn.style.opacity = '0.5';
            
            const roomCreated = await createRoom();
            if (!roomCreated) {
                isConnecting = false;
                if (btn) btn.style.opacity = '1';
                return;
            }
            
            // Fetch ICE servers dynamically
            const dynamicIceServers = await window.fetchIceServers();
            
            // Create PeerConnection inside window.mediaState
            ms.pc = new RTCPeerConnection({
                iceServers: dynamicIceServers
            });
            console.log('[DEBUG] pc created:', ms.pc);
            
            // Add tracks from ms.localStream
            ms.localStream.getTracks().forEach(function(track) { 
                ms.pc.addTrack(track, ms.localStream); 
                console.log('[DEBUG] Added track:', track.kind);
            });
            
            // Handle remote tracks
            ms.pc.ontrack = function(event) {
                console.log('[DEBUG] ontrack:', event.track.kind);
                if (!remoteStream.getTracks().find(function(t) { return t.id === event.track.id; })) {
                    remoteStream.addTrack(event.track);
                    log('✅ Received remote ' + event.track.kind + ' track', 'success');
                }
                document.getElementById('remoteVideo').srcObject = remoteStream;
                if (event.track.kind === 'audio') updateStatus('${tr.live} ✓', 'green');
            };
            
            // Handle ICE candidates
            ms.pc.onicecandidate = async function(event) {
                if (event.candidate) {
                    // console.log('[DEBUG] ICE candidate:', event.candidate.candidate.substring(0, 50));
                    await sendSignal('ice', event.candidate);
                }
            };
            
            // Connection state changes
            ms.pc.onconnectionstatechange = function() {
                console.log('[DEBUG] onconnectionstatechange:', ms.pc.connectionState);
                log('📡 ' + ms.pc.connectionState, ms.pc.connectionState === 'connected' ? 'success' : 'info');
                
                if (ms.pc.connectionState === 'connected') {
                    console.log('[DEBUG] Connection successful!');
                    updateStatus('${tr.live} ✓', 'green');
                    updateConnectionButtons(true);
                    startRecording();
                    isConnecting = false; // Allow future re-connections
                } else if (ms.pc.connectionState === 'failed') {
                    console.log('[DEBUG] Connection failed!');
                    updateStatus('${tr.error}', 'red');
                    updateConnectionButtons(false);
                    isConnecting = false;
                    const btn = document.getElementById('connectBtn');
                    if (btn) btn.style.opacity = '1';
                }
            };
            
            ms.pc.oniceconnectionstatechange = function() {
                console.log('[DEBUG] ICE connection state:', ms.pc.iceConnectionState);
            };
            
            // Setup WebSocket signaling (will send offer after connected)
            setupSignaling(roomCreated);
        }
        
        // ===== Signaling (WebSocket) =====
        function sendSignal(type, data) {
            if (signalingManager) {
                signalingManager.sendSignal(type, data);
            }
        }
        
        function setupSignaling(roomData) {
            signalingManager = new window.SignalingManager({
                signalingUrl: streamServerUrl,
                roomId: roomData.roomId,
                role: 'host',
                token: roomData.token,
                onSignal: async function(data) {
                    try {
                        if (data.signalType === 'answer') {
                            console.log('[DEBUG] Processing ANSWER signal');
                            await ms.pc.setRemoteDescription(new RTCSessionDescription(data.signalData));
                            hasRemoteDescription = true;
                            // معالجة ICE candidates المعلقة
                            while (pendingIceCandidates.length > 0) {
                                const ice = pendingIceCandidates.shift();
                                await ms.pc.addIceCandidate(new RTCIceCandidate(ice));
                                console.log('[DEBUG] Added pending ICE candidate');
                            }
                        } else if (data.signalType === 'ice') {
                            if (hasRemoteDescription) {
                                await ms.pc.addIceCandidate(new RTCIceCandidate(data.signalData));
                            } else {
                                pendingIceCandidates.push(data.signalData);
                                console.log('[DEBUG] Queued ICE candidate (waiting for answer)');
                            }
                        } else if (data.signalType === 'request_offer') {
                            console.log('[DEBUG] Guest requested offer - Renegotiating...');
                            const offer = await ms.pc.createOffer();
                            await ms.pc.setLocalDescription(offer);
                            sendSignal('offer', offer);
                        }
                    } catch (err) {
                        console.error('[Signaling] Error processing signal:', err);
                    }
                },
                onPeerJoined: function(data) {
                    log('👋 الضيف انضم للغرفة', 'success');
                },
                onPeerLeft: function(data) {
                    log('👋 الضيف غادر الغرفة', 'warn');
                },
                onError: function(error) {
                    log('❌ خطأ في الاتصال', 'error');
                },
                onConnected: async function() {
                    // إرسال Offer بعد اكتمال الاتصال
                    const offer = await ms.pc.createOffer();
                    console.log('[DEBUG] Offer created');
                    await ms.pc.setLocalDescription(offer);
                    sendSignal('offer', offer);
                    console.log('[DEBUG] Offer sent');
                }
            });
            
            signalingManager.connect();
        }
        
        // ===== Recording =====
        async function startRecording() {
            if (!ms.localStream || mediaRecorder) return;
            
            log('🔍 Testing device capabilities...');
            updateStatus('Testing device...', 'yellow');
            
            // جلب آخر chunk index من السيرفر لمنع الكتابة فوق القطع القديمة
            const lastIndex = await getLastChunkIndex();
            if (lastIndex > 0) {
                chunkIndex = lastIndex;
                log('🔢 Resuming from chunk: ' + chunkIndex, 'success');
            }
            
            // اختبار قدرات الجهاز واختيار الجودة المناسبة
            probeResults = await probeDevice();
            currentQuality = selectQuality(probeResults);
            updateQualityInfo();
            
            log('✅ Quality: ' + currentQuality.name + ' (' + (currentQuality.width*2) + 'x' + (currentQuality.height*2) + ')');
            updateStatus('Streaming...', 'green');
            
            log('${tr.canvas_recording}... (Competition: ' + competitionId + ')');
            
            const CANVAS_WIDTH = 1280;
            const CANVAS_HEIGHT = 720;
            const canvas = document.createElement('canvas');
            canvas.width = CANVAS_WIDTH;
            canvas.height = CANVAS_HEIGHT;
            const ctx = canvas.getContext('2d');
            
            // تحميل شعار Dueli
            const dueliLogo = new Image();
            dueliLogo.crossOrigin = 'anonymous';
            dueliLogo.src = '/static/dueli-icon.png';
            
            const localVideo = document.getElementById('localVideo');
            const remoteVideo = document.getElementById('remoteVideo');
            
            // اللغة والاتجاه (dynamically injected)
            const isRTL = ${isRightToLeft};
            const platformName = '${tr.app_title}';
            
            // دالة رسم الفيديو بشكل متناسب
            function drawVideoProportionalLocal(video, x, y, maxWidth, maxHeight) {
                if (!video || video.readyState < 2 || video.videoWidth === 0) return;
                
                const videoRatio = video.videoWidth / video.videoHeight;
                const targetRatio = maxWidth / maxHeight;
                let drawW, drawH;
                
                if (videoRatio > targetRatio) {
                    drawW = maxWidth;
                    drawH = maxWidth / videoRatio;
                } else {
                    drawH = maxHeight;
                    drawW = maxHeight * videoRatio;
                }
                
                const offsetX = x + (maxWidth - drawW) / 2;
                const offsetY = y + (maxHeight - drawH) / 2;
                
                ctx.fillStyle = '#000';
                ctx.fillRect(x, y, maxWidth, maxHeight);
                ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
                
                // إطار بألوان Dueli
                const borderGradient = ctx.createLinearGradient(x, y, x + maxWidth, y + maxHeight);
                borderGradient.addColorStop(0, '#9333ea'); // purple-600
                borderGradient.addColorStop(1, '#f59e0b'); // amber-500
                ctx.strokeStyle = borderGradient;
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, maxWidth, maxHeight);
            }
            
            function drawFrame() {
                // خلفية متدرجة
                const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                gradient.addColorStop(0, '#1a1a2e');
                gradient.addColorStop(1, '#16213e');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                
                // Dueli Logo + Text
                const logoSize = 40;
                const logoY = 10;
                
                if (isRTL) {
                    // RTL: النص يسار الشعار
                    const logoX = (CANVAS_WIDTH / 2) + 30;
                    
                    if (dueliLogo.complete && dueliLogo.naturalWidth > 0) {
                        ctx.drawImage(dueliLogo, logoX, logoY, logoSize, logoSize);
                    }
                    
                    const logoGradient = ctx.createLinearGradient(logoX - 100, 0, logoX, 0);
                    logoGradient.addColorStop(0, '#f59e0b');
                    logoGradient.addColorStop(1, '#9333ea');
                    ctx.fillStyle = logoGradient;
                    ctx.font = 'bold 32px Cairo, Arial';
                    ctx.textAlign = 'right';
                    ctx.fillText(platformName, logoX - 25, logoY + 32);
                } else {
                    // LTR: النص يمين الشعار
                    const logoX = (CANVAS_WIDTH / 2) - 70;
                    
                    if (dueliLogo.complete && dueliLogo.naturalWidth > 0) {
                        ctx.drawImage(dueliLogo, logoX, logoY, logoSize, logoSize);
                    }
                    
                    const logoGradient = ctx.createLinearGradient(logoX + logoSize, 0, logoX + logoSize + 100, 0);
                    logoGradient.addColorStop(0, '#9333ea');
                    logoGradient.addColorStop(1, '#f59e0b');
                    ctx.fillStyle = logoGradient;
                    ctx.font = 'bold 32px Inter, Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(platformName, logoX + logoSize + 10, logoY + 32);
                }
                
                const margin = 40;
                const videoAreaWidth = (CANVAS_WIDTH / 2) - (margin * 1.5);
                const videoAreaHeight = CANVAS_HEIGHT - (margin * 2);
                
                // رسم الفيديوهات (الترتيب حسب الاتجاه)
                if (isRTL) {
                    // RTL: المضيف يمين، الضيف يسار
                    drawVideoProportionalLocal(localVideo, (CANVAS_WIDTH / 2) + (margin / 2), margin + 20, videoAreaWidth, videoAreaHeight - 20);
                    drawVideoProportionalLocal(remoteVideo, margin, margin + 20, videoAreaWidth, videoAreaHeight - 20);
                } else {
                    // LTR: المضيف يسار، الضيف يمين
                    drawVideoProportionalLocal(localVideo, margin, margin + 20, videoAreaWidth, videoAreaHeight - 20);
                    drawVideoProportionalLocal(remoteVideo, (CANVAS_WIDTH / 2) + (margin / 2), margin + 20, videoAreaWidth, videoAreaHeight - 20);
                }
            }
            
            drawInterval = setInterval(drawFrame, Math.round(1000 / currentQuality.fps));
            
            const canvasStream = canvas.captureStream(currentQuality.fps);
            
            // دمج الصوت
            try {
                const audioContext = new AudioContext();
                const destination = audioContext.createMediaStreamDestination();
                if (ms.localStream.getAudioTracks().length > 0) {
                    audioContext.createMediaStreamSource(ms.localStream).connect(destination);
                    log('   ✅ ${tr.host} audio connected', 'success');
                }
                if (remoteStream && remoteStream.getAudioTracks().length > 0) {
                    audioContext.createMediaStreamSource(remoteStream).connect(destination);
                    log('   ✅ ${tr.guest} audio connected', 'success');
                }
                const mixedAudioTrack = destination.stream.getAudioTracks()[0];
                if (mixedAudioTrack) canvasStream.addTrack(mixedAudioTrack);
            } catch (e) {
                ms.localStream.getAudioTracks().forEach(function(t) { canvasStream.addTrack(t); });
            }
            
            mediaRecorder = new MediaRecorder(canvasStream, {
                mimeType: 'video/webm;codecs=vp8,opus',
                videoBitsPerSecond: currentQuality.bitrate,
                audioBitsPerSecond: 128000
            });
            
            mediaRecorder.ondataavailable = function(e) {
                if (e.data.size > 0) {
                    uploadQueue.push({ blob: e.data, index: chunkIndex++ });
                    processUploadQueue();
                }
            };
            
            mediaRecorder.start();
            segmentInterval = setInterval(function() {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    mediaRecorder.start();
                    log('${tr.new_chunk} (' + currentQuality.segment/1000 + 's)', 'info');
                }
            }, currentQuality.segment);
            
            log('${tr.canvas_recording} ✅', 'success');
            updateStatus('${tr.live}...', 'green');
        }
        
        async function processUploadQueue() {
            if (isUploading || uploadQueue.length === 0) return;
            
            // إذا زاد الطابور عن 3، أسقط الأقدم وخفض الجودة
            while (uploadQueue.length > 3) {
                uploadQueue.shift();
                droppedChunks++;
                log('⚠️ Chunk dropped - Total: ' + droppedChunks, 'warn');
                downgradeQuality();
            }
            
            isUploading = true;
            const { blob, index } = uploadQueue.shift();
            
            // التحقق من صحة القطعة
            const validation = validateChunk(blob, index);
            if (!validation.valid) {
                log('⚠️ Chunk ' + index + ' rejected: ' + validation.reason, 'error');
                isUploading = false;
                processUploadQueue();
                return;
            }
            
            const formData = new FormData();
            formData.append('chunk', blob, 'chunk_' + String(index).padStart(4, '0') + '.webm');
            formData.append('competition_id', competitionId.toString());
            formData.append('chunk_number', (index + 1).toString());
            formData.append('extension', 'webm');
            
            uploadStartTime = performance.now();
            
            try {
                const res = await fetch(ffmpegUrl + '/upload.php', { method: 'POST', body: formData });
                const result = await res.json();
                
                lastLatency = performance.now() - uploadStartTime;
                updateLatencyGauge(lastLatency);
                
                // إذا كان الرفع بطيئاً، خفض الجودة
                if (lastLatency > currentQuality.segment / 2) {
                    log('⚠️ Slow upload (' + Math.round(lastLatency) + 'ms)', 'warn');
                    downgradeQuality();
                }
                
                log('Chunk ' + index + ': ' + (result.success ? '✓' : '✗') + ' (' + Math.round(lastLatency) + 'ms)', result.success ? 'success' : 'error');
            } catch (err) {
                log('${tr.error}: ' + err.message, 'error');
            }
            
            isUploading = false;
            processUploadQueue();
        }
        
        function updateQualityInfo() {
            const info = document.getElementById('qualityInfo');
            if (info) info.textContent = '${tr.quality}: ' + currentQuality.name;
        }
        
        // ===== Reconnect & Disconnect =====
        window.reconnect = async function() {
            log('${tr.reconnect}...', 'info');
            if (mediaRecorder) { mediaRecorder.stop(); mediaRecorder = null; }
            if (drawInterval) { clearInterval(drawInterval); drawInterval = null; }
            if (ms.pc) { ms.pc.close(); ms.pc = null; }
            if (ms.pollingInterval) { clearInterval(ms.pollingInterval); ms.pollingInterval = null; }
            remoteStream = new MediaStream();
            document.getElementById('remoteVideo').srcObject = null;
            setTimeout(function() { if (ms.localStream) window.connect(); }, 1000);
        }
        
        window.disconnect = async function() {
            log('${tr.disconnect}...');
            if (segmentInterval) clearInterval(segmentInterval);
            if (drawInterval) clearInterval(drawInterval);
            if (mediaRecorder) mediaRecorder.stop();
            if (ms.pollingInterval) clearInterval(ms.pollingInterval);
            if (ms.pc) ms.pc.close();
            if (ms.localStream) ms.localStream.getTracks().forEach(function(t) { t.stop(); });
            ms.localStream = null;
            ms.pc = null;
            ms.pollingInterval = null;
            document.getElementById('localVideo').srcObject = null;
            document.getElementById('remoteVideo').srcObject = null;
            updateStatus('${tr.disconnect}', 'gray');
            log('${tr.disconnect} ✓', 'success');
            updateConnectionButtons(false);
        }
        
        // Set mobile alternative callback for translated messages
        window._showMobileAlternativeCallback = function() {
            updateStatus('${tr.toggle_camera} 📹', 'yellow');
            window.showMobileAlternative('${tr.toggle_camera}', '${tr.switch_camera}');
        };
        
        // Init
        const caps = detectDeviceCapabilities();
        if (caps.isMobile || !caps.supportsScreenShare) {
            updateStatus('📱 ${tr.toggle_camera}', 'blue');
        } else {
            updateStatus('${tr.share_screen}', 'blue');
        }
        })();
    `;
}

