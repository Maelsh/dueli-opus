/**
 * Live Room Page
 * صفحة غرفة البث المباشر
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

/**
 * Live Room Page Handler
 */
export const liveRoomPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = c.get('lang') as Language;
    const tr = translations[getUILanguage(lang)];
    const rtl = checkRTL(lang);
    const competitionId = c.req.param('id');

    // Fetch Jitsi config
    let jitsiConfig: any = null;
    try {
        const configRes = await fetch(`${new URL(c.req.url).origin}/api/jitsi/config`);
        const configData = await configRes.json() as any;
        if (configData.success) {
            jitsiConfig = configData.data;
        }
    } catch (err) {
        console.error('Failed to fetch Jitsi config:', err);
    }

    // Fetch competition details
    let competition: any = null;
    try {
        const compRes = await fetch(`${new URL(c.req.url).origin}/api/competitions/${competitionId}`);
        const compData = await compRes.json() as any;
        if (compData.success) {
            competition = compData.data;
        }
    } catch (err) {
        console.error('Failed to fetch competition:', err);
    }

    const content = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}
        
        <div class="flex-1 bg-gray-900">
            ${competition ? `
                <div class="h-screen flex flex-col">
                    <!-- Header -->
                    <div class="bg-gray-900 px-4 py-3 flex items-center justify-between z-10">
                        <div class="flex items-center gap-4">
                            <a href="/competition/${competitionId}?lang=${lang}" class="text-white hover:text-gray-300 transition-colors">
                                <i class="fas fa-arrow-${rtl ? 'right' : 'left'} text-xl"></i>
                            </a>
                            <div>
                                <h1 class="text-white font-bold text-lg line-clamp-1">${competition.title}</h1>
                                <div class="flex items-center gap-2 text-sm">
                                    <span class="flex items-center gap-1 text-red-500">
                                        <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                        ${tr.status_live || 'LIVE'}
                                    </span>
                                    <span class="text-gray-400" id="viewerCount">0 ${tr.viewers || 'viewers'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex items-center gap-2">
                            <button onclick="toggleAudio()" id="audioBtn" class="p-3 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors">
                                <i class="fas fa-microphone"></i>
                            </button>
                            <button onclick="toggleVideo()" id="videoBtn" class="p-3 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors">
                                <i class="fas fa-video"></i>
                            </button>
                            <button onclick="toggleScreenShare()" class="p-3 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors">
                                <i class="fas fa-desktop"></i>
                            </button>
                            <button onclick="endCall()" class="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors">
                                <i class="fas fa-phone-slash"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Video Container -->
                    <div class="flex-1 relative">
                        ${jitsiConfig ? `
                            <div id="jitsiContainer" class="absolute inset-0"></div>
                        ` : `
                            <div class="absolute inset-0 flex items-center justify-center text-white text-center p-8">
                                <div>
                                    <i class="fas fa-exclamation-triangle text-6xl text-amber-500 mb-4"></i>
                                    <h2 class="text-2xl font-bold mb-2">${tr.stream_not_available || 'Stream Not Available'}</h2>
                                    <p class="text-gray-400 mb-6">\${tr.jitsi_not_configured || tr.stream_not_available || 'Live streaming server is not configured.'}</p>
                                    <a href="/competition/${competitionId}?lang=${lang}" class="px-6 py-3 bg-purple-600 rounded-full font-semibold hover:bg-purple-700 transition-colors">
                                        ${tr.back || 'Go Back'}
                                    </a>
                                </div>
                            </div>
                        `}
                    </div>
                </div>
            ` : `
                <div class="min-h-screen flex items-center justify-center text-white text-center">
                    <div>
                        <i class="fas fa-video-slash text-6xl text-gray-600 mb-4"></i>
                        <h2 class="text-2xl font-bold mb-2">${tr.not_found || 'Competition Not Found'}</h2>
                        <a href="/?lang=${lang}" class="mt-4 inline-block px-6 py-3 bg-purple-600 rounded-full font-semibold hover:bg-purple-700 transition-colors">
                            ${tr.back_to_home || 'Back to Home'}
                        </a>
                    </div>
                </div>
            `}
        </div>
        
        ${jitsiConfig && competition ? `
        <script>
            const lang = '${lang}';
            const isRTL = ${rtl};
            const competitionId = '${competitionId}';
            const tr = ${JSON.stringify(tr)};
            const jitsiServerUrl = '${jitsiConfig.serverUrl}';
            const roomName = 'dueli-competition-${competitionId}';
            
            let audioMuted = false;
            let videoMuted = false;
            
            document.addEventListener('DOMContentLoaded', async () => {
                await checkAuth();
                
                if (!window.currentUser) {
                    showLoginModal();
                    return;
                }
                
                initJitsi();
            });
            
            async function initJitsi() {
                // Load Jitsi script
                const script = document.createElement('script');
                script.src = jitsiServerUrl + '/external_api.js';
                script.async = true;
                script.onload = () => {
                    startMeeting();
                };
                script.onerror = () => {
                    document.getElementById('jitsiContainer').innerHTML = '<div class="flex items-center justify-center h-full text-red-500"><i class="fas fa-exclamation-circle text-4xl mr-2"></i> Failed to load streaming service</div>';
                };
                document.head.appendChild(script);
            }
            
            function startMeeting() {
                if (typeof JitsiMeetExternalAPI === 'undefined') return;
                
                const user = window.currentUser;
                const domain = jitsiServerUrl.replace('https://', '').replace('http://', '');
                
                const api = new JitsiMeetExternalAPI(domain, {
                    roomName: roomName,
                    width: '100%',
                    height: '100%',
                    parentNode: document.getElementById('jitsiContainer'),
                    userInfo: {
                        displayName: user.display_name || user.username,
                        email: user.email
                    },
                    configOverwrite: {
                        startWithAudioMuted: true,
                        startWithVideoMuted: false,
                        prejoinPageEnabled: false,
                        disableDeepLinking: true,
                        disableInviteFunctions: true
                    },
                    interfaceConfigOverwrite: {
                        TOOLBAR_BUTTONS: [
                            'microphone', 'camera', 'desktop', 'fullscreen',
                            'chat', 'raisehand', 'videoquality', 'tileview'
                        ],
                        SHOW_JITSI_WATERMARK: false,
                        SHOW_POWERED_BY: false,
                        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
                    }
                });
                
                window.jitsiApi = api;
                
                api.addListener('participantJoined', updateViewerCount);
                api.addListener('participantLeft', updateViewerCount);
                api.addListener('videoConferenceLeft', () => {
                    window.location.href = '/competition/' + competitionId + '?lang=' + lang;
                });
            }
            
            async function updateViewerCount() {
                if (window.jitsiApi) {
                    const count = await window.jitsiApi.getNumberOfParticipants();
                    document.getElementById('viewerCount').textContent = count + ' ' + (tr.viewers || 'viewers');
                }
            }
            
            function toggleAudio() {
                if (window.jitsiApi) {
                    window.jitsiApi.executeCommand('toggleAudio');
                    audioMuted = !audioMuted;
                    const btn = document.getElementById('audioBtn');
                    if (audioMuted) {
                        btn.classList.add('bg-red-600');
                        btn.classList.remove('bg-gray-800');
                        btn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                    } else {
                        btn.classList.remove('bg-red-600');
                        btn.classList.add('bg-gray-800');
                        btn.innerHTML = '<i class="fas fa-microphone"></i>';
                    }
                }
            }
            
            function toggleVideo() {
                if (window.jitsiApi) {
                    window.jitsiApi.executeCommand('toggleVideo');
                    videoMuted = !videoMuted;
                    const btn = document.getElementById('videoBtn');
                    if (videoMuted) {
                        btn.classList.add('bg-red-600');
                        btn.classList.remove('bg-gray-800');
                        btn.innerHTML = '<i class="fas fa-video-slash"></i>';
                    } else {
                        btn.classList.remove('bg-red-600');
                        btn.classList.add('bg-gray-800');
                        btn.innerHTML = '<i class="fas fa-video"></i>';
                    }
                }
            }
            
            function toggleScreenShare() {
                if (window.jitsiApi) {
                    window.jitsiApi.executeCommand('toggleShareScreen');
                }
            }
            
            function endCall() {
                if (confirm(tr.confirm_end_call || 'Are you sure you want to end the call?')) {
                    if (window.jitsiApi) {
                        window.jitsiApi.executeCommand('hangup');
                    }
                    window.location.href = '/competition/' + competitionId + '?lang=' + lang;
                }
            }
        </script>
        ` : ''}
    `;

    return c.html(generateHTML(content, lang, competition?.title || 'Live Room'));
};

export default liveRoomPage;
