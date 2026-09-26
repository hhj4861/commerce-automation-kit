// Reviewed against official sources, 2026-09-26. These are discovery links,
// not a scraped track catalogue or a claim about the visitor's subscription.
export const MUSIC_SOURCES=[
 {name:'YouTube 오디오 보관함',badge:'무료 음원',url:'https://www.youtube.com/audiolibrary',terms:'https://support.google.com/youtube/answer/3376882?hl=ko',note:'YouTube 영상용 무료 음악·효과음. 곡별 출처 표기를 확인하세요. 다른 플랫폼 사용은 해당 이용 조건을 확인하세요.'},
 {name:'Pixabay Music',badge:'무료 음원',url:'https://pixabay.com/music/',terms:'https://pixabay.com/service/license-summary/',note:'무료 다운로드·영상 편집에 활용. 음원 단독 재판매는 불가하며, 곡별 권리와 Content ID 안내를 확인하세요.'},
 {name:'Suno',badge:'구독 확인 필요',url:'https://suno.com/account',terms:'https://about.suno.com/blog/suno-updates-tos',note:'이 앱에서는 구독 상태를 조회하지 않습니다. 다운로드 가능 여부와 상업 이용 권리를 계정에서 확인한 뒤 가져오세요.'},
 {name:'Eleven Music',badge:'요금제별 사용량 차감',url:'https://elevenlabs.io/app/music',terms:'https://elevenlabs.io/music-terms',note:'연결된 ElevenLabs 요금제는 목소리 탭에서 확인하세요. 음악 한도와 이용 범위는 별도 확인이 필요합니다. 생성·다운로드한 파일을 가져오세요.'},
];
export function voiceAccountInfo(caps={},now=Date.now()) {
 const account=caps.audioAccount,checked=Date.parse(account?.checkedAt);
 if(!account)return {title:caps.voice?'ElevenLabs 연결됨 · 요금제 확인 필요':'ElevenLabs 연결 확인 필요',note:'대본 음성 생성 시 사용량이 차감됩니다. 로그인 계정과 제작 서비스에 연결된 계정은 다를 수 있습니다.'};
 if(!Number.isFinite(checked)||now-checked>600000||checked>now+60000)return {title:'요금제 정보 갱신 대기',note:'최근 사용량을 확인할 수 없습니다. 잔여량과 무료 여부를 추정하지 않습니다.'};
 if(account.state==='disconnected')return {title:'ElevenLabs 미연결',note:'직접 녹음한 음성 파일은 오디오 탭에서 가져올 수 있습니다.'};
 if(account.state!=='ready')return {title:'요금제 조회 실패',note:'계정 조회 권한 또는 연결 상태를 확인하세요. 대본 음성 생성에는 사용량이 차감될 수 있습니다.'};
 const remaining=Number.isSafeInteger(account.remaining)?account.remaining.toLocaleString('ko-KR'):'확인 필요';
 return {title:`ElevenLabs · ${account.tier}`,note:`연결 계정 잔여 사용량: ${remaining} (API 기준). ${account.tier==='free'?'무료 요금제는 상업 이용이 지원되지 않습니다.':'요금제 포함 사용량도 생성 시 차감되며, 초과 과금·음성별 조건을 확인하세요.'} 목소리 샘플 듣기는 새 음성을 생성하지 않습니다.`};
}
