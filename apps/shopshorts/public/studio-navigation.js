// One route catalogue for the compact menu and standalone tools.
export const studioNavigation = [
  {label:'홈',href:'/',group:'영상 작업'},
  {label:'영상 제작실',href:'/studio/dashboard',group:'영상 작업'},
  {label:'게시 문구 추천',href:'/metadata',group:'영상 작업'},
  {label:'콘텐츠',href:'/contents',group:'영상 작업'},
  {label:'트렌드 탐색',href:'/trends',group:'탐색과 실험'},
  {label:'블로그 POC',href:'/blog',group:'탐색과 실험'},
  {label:'성과',href:'/performance',group:'관리'},
  {label:'제휴 링크',href:'/affiliate-links',group:'관리'},
  {label:'알림함',href:'/notifications',group:'관리'},
  {label:'설정',href:'/settings',group:'관리'},
];
export function navigationRoute(path) {
  const value=path.replace(/\/+$/,'')||'/';
  return value==='/studio'||value.startsWith('/studio/')||value==='/automatic'?'/studio/dashboard':value;
}
export function navigationLinks(path) {
  const route=navigationRoute(path);
  return studioNavigation.map(item=>`<a class="nav-item${item.href===route?' active':''}" href="${item.href}"${item.href===route?' aria-current="page"':''}>${item.label}</a>`).join('');
}
if(typeof document!=='undefined') {
  const brand='<a class="brand" href="/" aria-label="Shopshorts 홈"><span class="brand-mark" aria-hidden="true">✦</span><span class="brand-name">Shopshorts<span>Content Studio</span></span></a>';
  const shell=document.querySelector('[data-workspace-shell]');
  if(shell){
    document.body.classList.add('metadata-workspace');
    shell.outerHTML=`<aside class="sidebar">${brand}${[...new Set(studioNavigation.map(item=>item.group))].map(group=>`<div class="nav-label">${group}</div><nav aria-label="${group}">${studioNavigation.filter(item=>item.group===group).map(item=>`<a class="nav-item${item.href==='/metadata'?' active':''}" href="${item.href}"${item.href==='/metadata'?' aria-current="page"':''}>${item.label}</a>`).join('')}</nav>`).join('')}<div class="sidebar-foot"><a class="workspace-link" href="/studio/dashboard">제작 관리로 돌아가기</a></div></aside>`;
  }
  let mobileHead=document.querySelector('.mobile-head');
  if(!mobileHead){mobileHead=document.createElement('div');mobileHead.className='mobile-head';mobileHead.innerHTML=brand;document.body.insertBefore(mobileHead,document.body.children[1]);}
  const menu=document.createElement('details');menu.className='workspace-mobile-menu';
  menu.innerHTML=`<summary>전체 메뉴 <span data-current-page></span><span aria-hidden="true">⌄</span></summary><nav aria-label="모바일 전체 메뉴">${navigationLinks(location.pathname)}</nav>`;
  const previous=document.querySelector('.mobile-nav');if(previous)previous.replaceWith(menu);else mobileHead.after(menu);
  function update(){
    const route=navigationRoute(location.pathname),current=studioNavigation.find(item=>item.href===route);
    menu.querySelector('[data-current-page]').textContent=current?.label||'영상 제작실';
    menu.querySelectorAll('a').forEach(link=>{const active=link.getAttribute('href')===route;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  }
  update();window.addEventListener('popstate',update);window.addEventListener('studio-route-change',update);
  menu.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.open=false;menu.querySelector('summary').focus();}});
  document.querySelectorAll('.sidebar nav').forEach((nav,i)=>{if(!nav.hasAttribute('aria-label'))nav.setAttribute('aria-label',['영상 작업','탐색과 실험','관리'][i]||'작업 메뉴');});
}
