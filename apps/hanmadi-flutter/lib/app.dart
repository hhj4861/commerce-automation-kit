import 'models.dart';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'session.dart';
import 'study_model.dart';
import 'audio_service.dart';
import 'widgets.dart';
import 'study_screen.dart';
import 'music_screen.dart';
import 'tools_screen.dart';
import 'library_screen.dart';

class HanmadiApp extends StatefulWidget {
  final StudyModel model;
  final ClientSession? session;
  final bool initialize;
  const HanmadiApp({
    super.key,
    required this.model,
    this.session,
    this.initialize = true,
  });
  @override
  State<HanmadiApp> createState() => _HanmadiAppState();
}

class _HanmadiAppState extends State<HanmadiApp> {
  late final AudioService audio;
  late final GoRouter router;
  StudyModel get m => widget.model;
  @override
  void initState() {
    super.initState();
    audio = AudioService(m.api);
    router = GoRouter(
      initialLocation: '/study',
      refreshListenable: m,
      redirect: (context, s) {
        if (m.loading) return null;
        if (!m.loggedIn && s.matchedLocation != '/login') return '/login';
        if (m.loggedIn && s.matchedLocation == '/login') return '/study';
        return null;
      },
      routes: [
        GoRoute(
          path: '/login',
          builder: (_, _) => _Login(m: m, session: widget.session),
        ),
        StatefulShellRoute.indexedStack(
          builder: (context, s, shell) => _Shell(
            m: m,
            audio: audio,
            session: widget.session,
            shell: shell,
            music: s.matchedLocation.startsWith('/study/music/'),
            lesson: s.matchedLocation.startsWith('/study/lesson/'),
          ),
          branches: [
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/study',
                  builder: (_, _) => ListenableBuilder(
                    listenable: m,
                    builder: (_, _) => StudyScreen(m: m, audio: audio),
                  ),
                  routes: [
                    GoRoute(
                      path: 'music/:id',
                      builder: (_, s) => ListenableBuilder(
                        listenable: m,
                        builder: (_, _) => MusicScreen(
                          key: ValueKey(s.pathParameters['id']),
                          m: m,
                          audio: audio,
                          id: s.pathParameters['id']!,
                        ),
                      ),
                    ),
                    GoRoute(
                      path: 'lesson/:id',
                      builder: (_, s) => ListenableBuilder(
                        listenable: m,
                        builder: (_, _) => LessonScreen(
                          key: ValueKey(s.pathParameters['id']),
                          m: m,
                          audio: audio,
                          id: s.pathParameters['id']!,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/chat',
                  builder: (_, _) => ListenableBuilder(
                    listenable: m,
                    builder: (_, _) => ChatScreen(m: m, audio: audio),
                  ),
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/translate',
                  builder: (_, _) => ListenableBuilder(
                    listenable: m,
                    builder: (_, _) => TranslateScreen(m: m, audio: audio),
                  ),
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/library',
                  builder: (_, _) => ListenableBuilder(
                    listenable: m,
                    builder: (_, _) => LibraryScreen(m: m, audio: audio),
                  ),
                ),
              ],
            ),
          ],
        ),
      ],
    );
    if (widget.initialize) {
      Future<void>(() async {
        try {
          await widget.session?.initialize(m.refresh, m.message);
          await m.refresh();
        } catch (_) {
          m.loading = false;
          m.message('앱 저장소를 열지 못했어요. 앱을 다시 시작해 주세요.');
        }
      });
    }
  }

  @override
  void dispose() {
    router.dispose();
    audio.dispose();
    widget.session?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: '한마디',
    debugShowCheckedModeBanner: false,
    routerConfig: router,
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: paper,
      colorScheme: ColorScheme.fromSeed(
        seedColor: brand,
        primary: brand,
        surface: paper,
      ),
      fontFamily: 'NotoSansKR',
      fontFamilyFallback: const ['NotoSansThai', 'Hiragino Sans', 'sans-serif'],
      textTheme: const TextTheme(
        bodyMedium: TextStyle(fontSize: 15, color: ink, height: 1.5),
        bodyLarge: TextStyle(fontSize: 16, color: ink, height: 1.6),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: paper,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.all(16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: const BorderSide(color: Color(0xffe9eaf0)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: const BorderSide(color: Color(0xffe9eaf0)),
        ),
      ),
      navigationBarTheme: const NavigationBarThemeData(
        backgroundColor: Colors.white,
        indicatorColor: soft,
        height: 72,
        labelTextStyle: WidgetStatePropertyAll(
          TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
        ),
      ),
    ),
  );
}

class _Login extends StatelessWidget {
  final StudyModel m;
  final ClientSession? session;
  const _Login({required this.m, this.session});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: m,
    builder: (context, _) => Scaffold(
      body: SafeArea(
        child: PageBody(
          children: [
            const SizedBox(height: 65),
            const Text(
              'hanmadi',
              style: TextStyle(
                fontSize: 31,
                color: brand,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 60),
            const Heading(
              '한마디씩, 나답게.',
              '공부한 표현을 일상 속 대화로 이어가요.\n웹과 앱에서 같은 기록을 만날 수 있어요.',
            ),
            Primary(
              m.busy ? '연결 중…' : '로그인하고 시작하기',
              onPressed: m.busy
                  ? null
                  : () => m.run(() async {
                      await session?.login();
                      return true;
                    }),
            ),
            const SizedBox(height: 15),
            if (m.error != null)
              Text(m.error!, style: const TextStyle(color: Colors.red)),
            TextButton(onPressed: m.refresh, child: const Text('로그인 상태 다시 확인')),
          ],
        ),
      ),
    ),
  );
}

class _Shell extends StatelessWidget {
  final StudyModel m;
  final AudioService audio;
  final ClientSession? session;
  final StatefulNavigationShell shell;
  final bool music, lesson;
  const _Shell({
    required this.m,
    required this.audio,
    this.session,
    required this.shell,
    required this.music,
    required this.lesson,
  });
  static const labels = ['스터디', 'AI 대화', '번역', '보관함'];
  static const icons = [
    Icons.school_outlined,
    Icons.chat_bubble_outline_rounded,
    Icons.translate_rounded,
    Icons.bookmarks_outlined,
  ];
  void back(BuildContext c) {
    sound(m, audio.stop);
    if (audio.recording) sound(m, audio.cancelRecording);
    if (music) m.studyMode = m.lastStudyMode;
    c.go('/study');
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: m,
    builder: (context, _) => LayoutBuilder(
      builder: (context, box) {
        final wide = box.maxWidth >= 900;
        void navigate(int index) {
          sound(m, audio.stop);
          if (audio.recording) sound(m, audio.cancelRecording);
          shell.goBranch(index);
        }

        return Scaffold(
          appBar: AppBar(
            toolbarHeight: 68,
            titleSpacing: 22,
            automaticallyImplyLeading: false,
            title: music || lesson
                ? TextButton.icon(
                    key: const Key('study-back'),
                    onPressed: () => back(context),
                    icon: const Icon(Icons.arrow_back_rounded),
                    label: const Text('스터디로'),
                  )
                : const Text(
                    'hanmadi',
                    style: TextStyle(
                      color: brand,
                      fontSize: 23,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
            actions: [
              DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: m.language,
                  onChanged: m.busy || m.loading
                      ? null
                      : (v) => m.changeLanguage(v!),
                  items: languageNames.entries
                      .map(
                        (e) => DropdownMenuItem(
                          value: e.key,
                          child: Text(
                            e.value,
                            style: const TextStyle(fontSize: 14),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
              IconButton(
                tooltip: '학습 설정',
                onPressed: m.busy ? null : () => settings(context),
                icon: const Icon(Icons.account_circle_outlined),
              ),
              const SizedBox(width: 10),
            ],
          ),
          body: SafeArea(
            top: false,
            child: Column(
              children: [
                if (m.loading || m.busy)
                  const LinearProgressIndicator(minHeight: 2),
                if (m.error != null || m.notice != null)
                  Container(
                    color: m.error != null ? const Color(0xfffff1ef) : soft,
                    padding: const EdgeInsets.fromLTRB(18, 6, 4, 6),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            m.error ?? m.notice!,
                            style: TextStyle(
                              fontSize: 13,
                              color: m.error != null
                                  ? const Color(0xffa43838)
                                  : brand,
                            ),
                          ),
                        ),
                        if (m.error != null && m.catalog.isEmpty)
                          TextButton(
                            onPressed: m.refresh,
                            child: const Text('다시 불러오기'),
                          ),
                        IconButton(
                          tooltip: '알림 닫기',
                          onPressed: m.clearMessage,
                          icon: const Icon(Icons.close, size: 18),
                        ),
                      ],
                    ),
                  ),
                Expanded(
                  child: Row(
                    children: [
                      if (wide)
                        Container(
                          width: 210,
                          color: Colors.white,
                          padding: const EdgeInsets.fromLTRB(16, 32, 16, 16),
                          child: Column(
                            children: [
                              for (int i = 0; i < labels.length; i++)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: Material(
                                    color: Colors.transparent,
                                    child: ListTile(
                                      selected: shell.currentIndex == i,
                                      selectedTileColor: soft,
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(14),
                                      ),
                                      leading: Icon(icons[i]),
                                      title: Text(labels[i]),
                                      onTap: () => navigate(i),
                                    ),
                                  ),
                                ),
                              const Spacer(),
                              const Text(
                                '나만의 속도로, 한마디씩.',
                                style: TextStyle(color: muted, fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                      Expanded(
                        child: m.loading
                            ? const Center(child: CircularProgressIndicator())
                            : shell,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          bottomNavigationBar: wide
              ? null
              : NavigationBar(
                  selectedIndex: shell.currentIndex,
                  onDestinationSelected: navigate,
                  destinations: [
                    for (int i = 0; i < labels.length; i++)
                      NavigationDestination(
                        icon: Icon(icons[i], size: 22),
                        label: labels[i],
                      ),
                  ],
                ),
        );
      },
    ),
  );
  Future<void> settings(BuildContext context) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (c) => ListenableBuilder(
        listenable: m,
        builder: (context, _) => Padding(
          padding: const EdgeInsets.all(24),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${m.name} 님의 학습',
                  style: const TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 18),
                if (m.profile.isNotEmpty) ...[
                  DropdownButtonFormField<int>(
                    initialValue: m.level,
                    decoration: const InputDecoration(labelText: '연습 레벨'),
                    items: List.generate(
                      4,
                      (i) => DropdownMenuItem(
                        value: i + 1,
                        child: Text('${i + 1} · ${levelNames[i]}'),
                      ),
                    ),
                    onChanged: m.busy
                        ? null
                        : (v) => m.action('level', {
                            'level': v,
                            'minutes': m.profile['minutes'] ?? 5,
                          }),
                  ),
                  const SizedBox(height: 15),
                ],
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('번역에서 내 표현 자동 저장'),
                  subtitle: const Text('개인정보가 없는 짧은 연습 표현만 저장해요.'),
                  value: m.state['autoSave'] == true,
                  onChanged: m.busy
                      ? null
                      : (v) => m.action('settings', {'autoSave': v}),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('AI 대화 표현 자동 저장'),
                  value: m.state['autoSaveChat'] != false,
                  onChanged: m.busy
                      ? null
                      : (v) => m.action('settings', {'autoSaveChat': v}),
                ),
                const SizedBox(height: 20),
                TextButton.icon(
                  onPressed: m.busy
                      ? null
                      : () async {
                          final ok = await m.run(() async {
                            await session?.logout();
                            m.state = {};
                            m.catalog = {};
                            m.music = {};
                            m.translation = {};
                            m.chatDraft = '';
                            m.translationDraft = '';
                            m.clearChats();
                            m.loggedIn = false;
                            return true;
                          });
                          if (ok == true && c.mounted) Navigator.pop(c);
                        },
                  icon: const Icon(Icons.logout),
                  label: const Text('로그아웃'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
