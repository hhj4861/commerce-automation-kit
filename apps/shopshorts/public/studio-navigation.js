// One route catalogue for the compact menu and standalone tools.
export const studioNavigation = [
  {label:'홈',href:'/',group:'영상 작업'},
  {label:'새 영상 만들기',href:'/studio/dashboard',group:'영상 작업'},
  {label:'Kandinsky 영상 생성',href:'/kandinsky',group:'제작 도구'},
  {label:'게시 문구 추천',href:'/metadata',group:'제작 도구'},
  {label:'내 영상',href:'/contents',group:'영상 작업'},
  {label:'트렌드 탐색',href:'/trends',group:'제작 도구'},
  {label:'블로그 POC',href:'/blog',group:'기타 도구'},
  {label:'성과',href:'/performance',group:'영상 작업'},
  {label:'제휴 링크',href:'/affiliate-links',group:'기타 도구'},
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
  const brand='<a class="brand" href="/" aria-label="Shopshorts 홈"><span class="brand-mark" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 6 9 6-9 6V6Z"/></svg></span><span class="brand-name">Shopshorts<span>Content Studio</span></span></a>';
  const shell=document.querySelector('[data-workspace-shell]');
  if(shell){
    if(!document.body.classList.contains('kandinsky-workspace'))document.body.classList.add('metadata-workspace');
    shell.outerHTML=`<aside class="sidebar">${brand}<div class="sidebar-foot"><a class="workspace-link" href="/studio/dashboard">새 영상 만들기</a></div></aside>`;

  }
  const sidebar=document.querySelector('.sidebar');
  const routeNames={dashboard:'/',content:'/contents',trends:'/trends',blog:'/blog',performance:'/performance',links:'/affiliate-links',notifications:'/notifications',settings:'/settings'};
  if(sidebar){
    const existing=[...sidebar.querySelectorAll('.nav-item')];
    const fragment=document.createDocumentFragment();
    for(const group of ['영상 작업','제작 도구','기타 도구','관리']){
      const nav=document.createElement('nav');nav.setAttribute('aria-label',group);
      for(const item of studioNavigation.filter(item=>item.group===group)){
        const link=existing.find(node=>(routeNames[node.dataset.nav]||navigationRoute(new URL(node.getAttribute('href')||'/',location.origin).pathname))===item.href)||document.createElement('a');
        if(link.tagName==='A')link.setAttribute('href',item.href);
        link.classList.add('nav-item');link.dataset.workspaceRoute=item.href;
        for(const text of [...link.childNodes].filter(node=>node.nodeType===3))text.remove();
        const label=document.createTextNode(item.label);link.insertBefore(label,link.querySelector('.notification-badge'));
        nav.append(link);
      }
      if(group.endsWith('도구')){
        const fold=document.createElement('details');fold.className='workspace-nav-tools';
        const title=document.createElement('summary');title.textContent=group;fold.append(title,nav);fragment.append(fold);
      }else{const title=document.createElement('div');title.className='nav-label';title.textContent=group;fragment.append(title,nav);}
    }
    sidebar.replaceChildren(sidebar.querySelector('.brand'),fragment,sidebar.querySelector('.sidebar-foot'));
  }
  let mobileHead=document.querySelector('.mobile-head');
  if(!mobileHead){mobileHead=document.createElement('div');mobileHead.className='mobile-head';mobileHead.innerHTML=brand;document.body.insertBefore(mobileHead,document.body.children[1]);}
  const menu=document.createElement('details');menu.className='workspace-mobile-menu';
  menu.innerHTML=`<summary>전체 메뉴 <span data-current-page></span><span aria-hidden="true">⌄</span></summary><nav aria-label="모바일 전체 메뉴">${navigationLinks(location.pathname)}</nav>`;
  const previous=document.querySelector('.mobile-nav');if(previous)previous.replaceWith(menu);else mobileHead.after(menu);
  function update(){
    const route=navigationRoute(location.pathname),current=studioNavigation.find(item=>item.href===route);
    menu.querySelector('[data-current-page]').textContent=current?.label||'영상 제작실';
    document.querySelectorAll('.sidebar [data-workspace-route]').forEach(link=>{const active=link.dataset.workspaceRoute===route;link.classList.toggle('active',active);if(active){link.setAttribute('aria-current','page');const fold=link.closest('details');if(fold)fold.open=true;}else link.removeAttribute('aria-current');});
    menu.querySelectorAll('a').forEach(link=>{const active=link.getAttribute('href')===route;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  }
  update();window.addEventListener('popstate',update);window.addEventListener('studio-route-change',update);
  menu.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.open=false;menu.querySelector('summary').focus();}});
  document.querySelectorAll('.sidebar nav').forEach((nav,i)=>{if(!nav.hasAttribute('aria-label'))nav.setAttribute('aria-label',['영상 작업','탐색과 실험','관리'][i]||'작업 메뉴');});
}
