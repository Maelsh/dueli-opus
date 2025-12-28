/**
 * Test Stream Client Shared Script
 * الدوال والـ Classes المشتركة بين جميع صفحات الاختبار
 * يُحقن في كل صفحة عبر main.ts
 */

const FFMPEG_URL = 'https://maelsh.pro/ffmpeg';
const STREAM_SERVER_URL = 'https://stream.maelsh.pro';
const TEST_ROOM_ID = 'test_room_001';

/**
 * Get Client Shared Script - توليد الـ JavaScript المشترك
 */
export function getClientSharedScript(): string {
    return `
// ===== Utility Functions =====

/**
 * testLog - طباعة رسالة في السجل والـ console
 */
function testLog(msg, type = 'info') {
    const logEl = document.getElementById('log');
    if (!logEl) return;

    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = 'log-entry log-' + type;
    div.innerHTML = '[' + time + '] ' + msg;
    logEl.appendChild(div);

    if (logEl.parentElement) {
        logEl.parentElement.scrollTop = logEl.parentElement.scrollHeight;
    }

    console.log('[' + type.toUpperCase() + ']', msg);
}

window.testLog = testLog;

/**
 * updateStatus - تحديث حالة الصفحة
 */
function updateStatus(text, color = 'yellow') {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.innerHTML =
            '<span class="text-' + color + '-600 dark:text-' + color + '-400"><i class="fas fa-circle mr-2" aria-hidden="true"></i>' + text + '</span>';
    }
}

window.updateStatus = updateStatus;

/**
 * setMode - تحديث شارة الوضع (للمشاهد)
 */
function setMode(mode, text) {
    const modeBadge = document.getElementById('modeBadge');
    if (!modeBadge) return;

    modeBadge.classList.remove('hidden', 'mode-hls', 'mode-mse', 'mode-vod');

    if (mode === 'hls') {
        modeBadge.classList.add('mode-hls', 'pulse');
        modeBadge.innerHTML = '<i class="fas fa-broadcast-tower mr-1" aria-hidden="true"></i>HLS';
    } else if (mode === 'mse') {
        modeBadge.classList.add('mode-mse', 'pulse');
        modeBadge.innerHTML = '<i class="fas fa-puzzle-piece mr-1" aria-hidden="true"></i>MSE';
    } else if (mode === 'vod') {
        modeBadge.classList.add('mode-vod');
        modeBadge.innerHTML = '<i class="fas fa-film mr-1" aria-hidden="true"></i>VOD';
    } else {
        modeBadge.classList.add('hidden');
    }
}

window.setMode = setMode;

/**
 * detectDeviceCapabilities - كشف قدرات الجهاز
 */
function detectDeviceCapabilities() {
    const capabilities = {
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        supportsScreenShare: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
        supportsCamera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    };
    
    testLog('📱 Device:', 'info');
    testLog('   - Mobile: ' + capabilities.isMobile, capabilities.isMobile ? 'warn' : 'info');
    testLog('   - Screen: ' + capabilities.supportsScreenShare, capabilities.supportsScreenShare ? 'success' : 'error');
    testLog('   - Camera: ' + capabilities.supportsCamera, capabilities.supportsCamera ? 'success' : 'error');
    
    return capabilities;
}

window.detectDeviceCapabilities = detectDeviceCapabilities;

/**
 * drawVideoProportional - رسم فيديو بشكل متناسب
 */
function drawVideoProportional(ctx, video, x, y, maxWidth, maxHeight, label) {
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

    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, maxWidth, maxHeight);

    if (label) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(x + 10, y + maxHeight - 35, 80, 25);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(label, x + 20, y + maxHeight - 15);
    }
}

window.drawVideoProportional = drawVideoProportional;

// ===== Quality Presets =====

const qualityPresets = {
    excellent: { name: 'Excellent', width: 1280, height: 360, fps: 30, segment: 4000, bitrate: 2000000 },
    good:      { name: 'Good', width: 854,  height: 240, fps: 24, segment: 6000, bitrate: 1000000 },
    medium:    { name: 'Medium', width: 640,  height: 180, fps: 15, segment: 10000, bitrate: 500000 },
    low:       { name: 'Low', width: 426,  height: 120, fps: 10, segment: 20000, bitrate: 250000 },
    minimal:   { name: 'Minimal', width: 320,  height: 90,  fps: 10, segment: 30000, bitrate: 150000 }
};

window.qualityPresets = qualityPresets;

// ===== Shared State Variables =====
// متغيرات الحالة المشتركة بين host و guest
let localStream = null;
let pc = null;
let pollingInterval = null;
let isScreenSharing = false;
let isCameraOn = false;
let currentFacing = 'user';
let isMicOn = true;
let isSpeakerOn = true;
let isConnected = false;
let remoteStream = null;

// تصدير للـ window
window.mediaState = {
    get localStream() { return localStream; },
    set localStream(v) { localStream = v; },
    get pc() { return pc; },
    set pc(v) { pc = v; },
    get pollingInterval() { return pollingInterval; },
    set pollingInterval(v) { pollingInterval = v; },
    get isScreenSharing() { return isScreenSharing; },
    set isScreenSharing(v) { isScreenSharing = v; },
    get isCameraOn() { return isCameraOn; },
    set isCameraOn(v) { isCameraOn = v; },
    get currentFacing() { return currentFacing; },
    set currentFacing(v) { currentFacing = v; },
    get isMicOn() { return isMicOn; },
    set isMicOn(v) { isMicOn = v; },
    get isSpeakerOn() { return isSpeakerOn; },
    set isSpeakerOn(v) { isSpeakerOn = v; },
    get isConnected() { return isConnected; },
    set isConnected(v) { isConnected = v; },
    get remoteStream() { return remoteStream; },
    set remoteStream(v) { remoteStream = v; }
};

// ===== Common Media Functions =====

/**
 * updateButtonStates - تحديث حالة أزرار الشاشة والكاميرا
 */
function updateButtonStates() {
    const screenBtn = document.getElementById('screenBtn');
    const cameraBtn = document.getElementById('cameraBtn');
    const cameraIcon = document.getElementById('cameraIcon');
    const screenIcon = document.getElementById('screenIcon');
    
    if (screenBtn) {
        screenBtn.classList.toggle('bg-blue-800', isScreenSharing);
        screenBtn.classList.toggle('bg-blue-600', !isScreenSharing);
    }
    if (cameraBtn) {
        cameraBtn.classList.toggle('bg-purple-800', isCameraOn);
        cameraBtn.classList.toggle('bg-purple-600', !isCameraOn);
    }
    if (cameraIcon) {
        cameraIcon.className = isCameraOn ? 'fas fa-video text-white' : 'fas fa-video-slash text-white';
    }
    if (screenIcon) {
        screenIcon.className = isScreenSharing ? 'fas fa-desktop text-white' : 'fas fa-desktop text-white';
    }
}

window.updateButtonStates = updateButtonStates;

/**
 * updateConnectionButtons - تحديث أزرار الاتصال
 * تعمل مع كلا الـ host (connectBtn) و guest (joinBtn)
 */
function updateConnectionButtons(connected) {
    isConnected = connected;
    
    // Host buttons
    const connectBtn = document.getElementById('connectBtn');
    const reconnectBtn = document.getElementById('reconnectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    
    // Guest buttons
    const joinBtn = document.getElementById('joinBtn');
    
    if (connectBtn) {
        connectBtn.classList.toggle('hidden', connected);
    }
    if (joinBtn) {
        joinBtn.classList.toggle('hidden', connected);
    }
    if (reconnectBtn) {
        reconnectBtn.classList.toggle('hidden', !connected);
    }
    if (disconnectBtn) {
        disconnectBtn.classList.toggle('hidden', !connected);
    }
    
    testLog('أزرار الاتصال تم تحديثها - متصل: ' + connected, 'info');
}

window.updateConnectionButtons = updateConnectionButtons;

/**
 * toggleFullscreen - تبديل ملء الشاشة
 */
window.toggleFullscreen = function() {
    const remoteContainer = document.getElementById('remoteVideoContainer');
    if (!remoteContainer) return;
    
    if (!document.fullscreenElement) {
        if (remoteContainer.requestFullscreen) {
            remoteContainer.requestFullscreen();
        } else if (remoteContainer.webkitRequestFullscreen) {
            remoteContainer.webkitRequestFullscreen();
        } else if (remoteContainer.msRequestFullscreen) {
            remoteContainer.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.exitFullscreen();
        }
    }
};

// استماع لتغيير حالة ملء الشاشة
document.addEventListener('fullscreenchange', function() {
    const icon = document.getElementById('fullscreenIcon');
    if (icon) {
        icon.className = document.fullscreenElement ? 
            'fas fa-compress text-white text-sm' : 
            'fas fa-expand text-white text-sm';
    }
});

/**
 * toggleLocalVideoVisibility - تبديل رؤية الفيديو المحلي
 */
function toggleLocalVideoVisibility() {
    const localWrapper = document.getElementById('localVideoWrapper');
    const remoteWrapper = document.getElementById('remoteVideoWrapper');
    const icon = document.getElementById('hideLocalIcon');
    
    if (!localWrapper || !remoteWrapper) return;
    
    const isVisible = !localWrapper.classList.contains('video-wrapper-hidden');
    
    if (isVisible) {
        localWrapper.classList.add('video-wrapper-hidden');
        localWrapper.classList.remove('w-full', 'md:w-[48%]');
        remoteWrapper.classList.remove('w-full', 'md:w-[48%]');
        remoteWrapper.classList.add('w-full', 'md:w-[80%]');
        if (icon) icon.className = 'fas fa-eye-slash text-white';
    } else {
        localWrapper.classList.remove('video-wrapper-hidden');
        localWrapper.classList.add('w-full', 'md:w-[48%]');
        remoteWrapper.classList.remove('w-full', 'md:w-[80%]');
        remoteWrapper.classList.add('w-full', 'md:w-[48%]');
        if (icon) icon.className = 'fas fa-eye text-white';
    }
}

window.toggleLocalVideoVisibility = toggleLocalVideoVisibility;

/**
 * toggleSpeaker - تبديل السماعة
 */
window.toggleSpeaker = function() {
    const remoteVideo = document.getElementById('remoteVideo');
    isSpeakerOn = !isSpeakerOn;
    if (remoteVideo) remoteVideo.muted = !isSpeakerOn;
    const icon = document.getElementById('speakerIcon');
    if (icon) icon.className = isSpeakerOn ? 'fas fa-volume-up text-white' : 'fas fa-volume-mute text-white';
};

/**
 * toggleLocalVideo - تبديل رؤية الفيديو المحلي
 */
window.toggleLocalVideo = function() {
    toggleLocalVideoVisibility();
};

/**
 * switchCamera - تبديل الكاميرا أمامية/خلفية
 */
window.switchCamera = async function() {
    if (!localStream || isScreenSharing) {
        testLog('الرجاء تشغيل الكاميرا أولاً', 'warn');
        return;
    }
    currentFacing = currentFacing === 'user' ? 'environment' : 'user';
    await window.useCamera(currentFacing);
};

/**
 * toggleMic - تبديل الميكروفون
 */
window.toggleMic = function() {
    if (!localStream) return;
    isMicOn = !isMicOn;
    localStream.getAudioTracks().forEach(function(track) { track.enabled = isMicOn; });
    const icon = document.getElementById('micIcon');
    if (icon) icon.className = isMicOn ? 'fas fa-microphone text-white' : 'fas fa-microphone-slash text-white';
    testLog(isMicOn ? 'تم تشغيل الميكروفون' : 'تم إيقاف الميكروفون', 'info');
};

/**
 * toggleScreen - تبديل مشاركة الشاشة
 */
window.toggleScreen = async function() {
    if (isScreenSharing) {
        // إيقاف مشاركة الشاشة
        if (localStream) localStream.getTracks().forEach(function(t) { t.stop(); });
        localStream = null;
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = null;
        isScreenSharing = false;
        isCameraOn = false;
        testLog('تم إيقاف مشاركة الشاشة', 'info');
        updateStatus('اضغط "مشاركة الشاشة"', 'yellow');
    } else {
        // إغلاق الكاميرا أولاً إن كانت مفعلة
        if (isCameraOn && localStream) {
            localStream.getTracks().forEach(function(t) { t.stop(); });
            localStream = null;
            isCameraOn = false;
        }
        // بدء مشاركة الشاشة
        await window.shareScreen();
        if (localStream) {
            isScreenSharing = true;
            isCameraOn = false;
        }
    }
    updateButtonStates();
};

/**
 * toggleCamera - تبديل الكاميرا
 */
window.toggleCamera = async function() {
    if (isCameraOn) {
        // إيقاف الكاميرا
        if (localStream) localStream.getTracks().forEach(function(t) { t.stop(); });
        localStream = null;
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = null;
        isCameraOn = false;
        isScreenSharing = false;
        testLog('تم إيقاف الكاميرا', 'info');
        updateStatus('اضغط "تشغيل الكاميرا"', 'yellow');
    } else {
        // إغلاق مشاركة الشاشة أولاً إن كانت مفعلة
        if (isScreenSharing && localStream) {
            localStream.getTracks().forEach(function(t) { t.stop(); });
            localStream = null;
            isScreenSharing = false;
        }
        // بدء الكاميرا
        await window.useCamera(currentFacing);
        if (localStream) {
            isCameraOn = true;
            isScreenSharing = false;
        }
    }
    updateButtonStates();
};

/**
 * showMobileAlternative - عرض أزرار بديلة للموبايل
 */
function showMobileAlternative(frontLabel, backLabel) {
    let cameraBtns = document.getElementById('cameraButtons');
    if (!cameraBtns) {
        cameraBtns = document.createElement('div');
        cameraBtns.id = 'cameraButtons';
        cameraBtns.className = 'flex flex-wrap gap-2 justify-center mb-4';
        
        const frontBtn = document.createElement('button');
        frontBtn.className = 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition';
        frontBtn.innerHTML = '<i class="fas fa-camera mr-2"></i>' + (frontLabel || 'الكاميرا الأمامية');
        frontBtn.onclick = function() { window.useCamera('user'); };
        
        const backBtn = document.createElement('button');
        backBtn.className = 'px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition';
        backBtn.innerHTML = '<i class="fas fa-camera-retro mr-2"></i>' + (backLabel || 'الكاميرا الخلفية');
        backBtn.onclick = function() { window.useCamera('environment'); };
        
        cameraBtns.appendChild(frontBtn);
        cameraBtns.appendChild(backBtn);
        
        const controlsDiv = document.querySelector('.flex.flex-wrap.gap-2.justify-center.mb-4');
        if (controlsDiv && controlsDiv.parentElement) {
            controlsDiv.parentElement.insertBefore(cameraBtns, controlsDiv);
        }
    }
    cameraBtns.style.display = 'flex';
}

window.showMobileAlternative = showMobileAlternative;

/**
 * shareScreen - مشاركة الشاشة
 */
window.shareScreen = async function() {
    const caps = detectDeviceCapabilities();
    
    if (caps.isMobile || !caps.supportsScreenShare) {
        testLog('مشاركة الشاشة غير متاحة على هذا الجهاز', 'warn');
        showMobileAlternative();
        return;
    }
    
    try {
        testLog('طلب مشاركة الشاشة...');
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: true
        });
        
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = localStream;
        
        testLog('تم الحصول على الشاشة ✓', 'success');
        updateStatus('الشاشة جاهزة - اضغط الاتصال', 'green');
        
        localStream.getVideoTracks()[0].onended = function() {
            testLog('تم إيقاف مشاركة الشاشة', 'warn');
            updateStatus('الشاشة متوقفة - شارك شاشة جديدة', 'yellow');
            isScreenSharing = false;
            updateButtonStates();
        };
    } catch (err) {
        testLog('فشل مشاركة الشاشة: ' + err.message, 'warn');
        showMobileAlternative();
    }
};

/**
 * useCamera - استخدام الكاميرا
 */
window.useCamera = async function(facingMode) {
    try {
        testLog('طلب الكاميرا ' + (facingMode === 'user' ? 'الأمامية' : 'الخلفية') + '...');
        
        const oldStream = localStream;
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true
        });
        
        // إذا كان الاتصال قائماً - استبدال الـ tracks
        if (pc && pc.connectionState === 'connected') {
            testLog('🔄 استبدال المسارات في الاتصال القائم...', 'info');
            const senders = pc.getSenders();
            const videoSender = senders.find(function(s) { return s.track && s.track.kind === 'video'; });
            const audioSender = senders.find(function(s) { return s.track && s.track.kind === 'audio'; });
            
            if (videoSender) await videoSender.replaceTrack(newStream.getVideoTracks()[0]);
            if (audioSender) await audioSender.replaceTrack(newStream.getAudioTracks()[0]);
        }
        
        if (oldStream) oldStream.getTracks().forEach(function(t) { t.stop(); });
        
        localStream = newStream;
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = localStream;
        
        const cameraBtns = document.getElementById('cameraButtons');
        if (cameraBtns) cameraBtns.style.display = 'none';
        
        isCameraOn = true;
        isScreenSharing = false;
        currentFacing = facingMode;
        
        testLog('تم الحصول على الكاميرا ✓', 'success');
        updateStatus('الكاميرا جاهزة - اضغط الاتصال', 'green');
    } catch (err) {
        testLog('فشل الكاميرا: ' + err.message, 'error');
        if (err.name === 'NotAllowedError') {
            updateStatus('الرجاء السماح بالوصول للكاميرا', 'red');
        } else if (err.name === 'NotFoundError') {
            updateStatus('لا توجد كاميرا', 'red');
        }
    }
};

// ===== Signaling Functions =====

/**
 * sendSignal - إرسال إشارة
 */
window.sendSignal = async function(type, data) {
    const actualRoom = window.actualRoomId || window.roomId || '${TEST_ROOM_ID}';
    try {
        await fetch('${STREAM_SERVER_URL}' + '/api/signaling/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: actualRoom,
                from_role: window.role || 'host',
                signal_type: type,
                signal_data: data
            })
        });
    } catch (err) {
        testLog('خطأ في الإرسال: ' + err.message, 'error');
    }
};

/**
 * handleConnectionFailure - معالجة فشل الاتصال
 */
window.handleConnectionFailure = function() {
    testLog('🔄 تنظيف الاتصال الفاشل...', 'warn');
    
    // إيقاف التسجيل إذا كان قائماً
    if (window.mediaRecorder && window.mediaRecorder.state !== 'inactive') {
        window.mediaRecorder.stop();
    }
    window.mediaRecorder = null;
    
    // إغلاق الـ peer connection
    if (pc) {
        pc.close();
        pc = null;
    }
    
    // إيقاف الـ polling
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    
    testLog('✅ جاهز لإعادة الاتصال', 'info');
    updateConnectionButtons(false);
};

/**
 * disconnect - إنهاء الاتصال
 */
window.disconnect = function() {
    testLog('إنهاء الاتصال...');
    
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    
    if (pc) {
        pc.close();
        pc = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(function(t) { t.stop(); });
        localStream = null;
    }
    
    if (remoteStream) {
        remoteStream.getTracks().forEach(function(t) { t.stop(); });
        remoteStream = null;
    }
    
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
    
    updateStatus('غير متصل', 'gray');
    testLog('تم الإنهاء ✓', 'success');
    updateConnectionButtons(false);
};

console.log('[Client Shared] تم تحميل الدوال المشتركة بنجاح');
`;
}
