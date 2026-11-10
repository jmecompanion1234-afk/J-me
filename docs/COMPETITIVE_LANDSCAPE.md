# J-me competitive landscape (researched 2026-11-09)

Researched by a web-search agent on 2026-11-09. Every product claim carries its URL;
aggregator trademark data should be confirmed in TSDR / EUIPO before relying on it.

## (a) Bottom line

- **Partly done, not done.** Every piece exists somewhere; nobody ships the combination: *proactive* (not ask-to-answer) + *local-first* + *ambient room/media audio* + *any device* + *a staged queue that decays*.
- **The meeting-copilot category is crowded and reactive.** Cluely, Fireflies Live Assist, Zoom, Meet, Teams, Otter all answer when asked during a *call*; proactivity is limited to "coaching prompts," and all are cloud. The "stealth" clones (Cluely, Interview Coder, Cheating Daddy/Glass/Pluely) are the same mechanism aimed at interviews.
- **Closest in spirit is Hedy** (proactive nudges, on-device option, Mac/Win/iOS/Android/Watch) but it coaches *you*, does not search the web, and does not have a media mode ([hedy.ai](https://www.hedy.ai/), [pricing](https://www.hedy.ai/pricing)).
- **The research says the mechanism is sound and the hard part is *when* to act.** Rhodes/Maes JITIR (1997–2000), Andolina et al. DIS 2018 (a listening proactive search agent that "reduced the need for explicit searching"), ProCIS 2024, Conv2Query SIGIR 2025, LlamaPIE ACL 2025 (on-device, small model decides when). No paper or patent found describes a *time-decaying queue of pre-staged queries*.
- **Real white space:** (1) media mode (podcast/video second-screen Jamie; no product found), (2) in-room conversation rather than video calls, (3) local-first as the selling point now that Limitless went to Meta, Bee to Amazon, Humane is dead, Rewind wound down, (4) the decay/one-tap UX.

## (b) Direct competitors

| Tool | Live behaviour | Local? | Platforms | Price | Activity | Gap vs J-me |
|---|---|---|---|---|---|---|
| [Cluely](https://cluely.com/) | Listens in real time; you press Cmd/Ctrl+Enter for an answer; "helps during the call, not after" | Not stated (cloud by behaviour) | Mac desktop, iOS; Windows unstated | Free; Pro $19.99/mo; +Undetectability $149.99/mo ([pricing](https://cluely.com/pricing)) | Active 2026 | On-demand, not pre-staged; cloud; meeting/interview framing |
| [Hedy](https://www.hedy.ai/) | Proactive on-screen suggestions, talking points, nudges | STT on-device by default; "Local AI Processing" tier on capable hardware | Mac, iOS, Watch, Win, Android, web | Free 5 h/mo; Pro $12.99/mo or $299 lifetime | Active | No web search, no media mode, coaching not lookup |
| [Fireflies Live Assist](https://fireflies.ai/live-assist) | Live notes/answers; AskFred can run web searches in-panel ([guide](https://guide.fireflies.ai/articles/7077919424-explore-the-real-time-pane-on-the-fireflies-chrome-extension)) | Cloud | Desktop, Chrome, mobile | n/a | Launched with desktop app ([blog](https://fireflies.ai/blog/fireflies-launches-live-assist-and-desktop-app/)) | Reactive, cloud, meetings only |
| [Otter](https://otter.ai/) | Live transcript; "Live-Assist" coaching prompts; AI Chat across meetings | Cloud | Mac/Win desktop, mobile, Chrome, bot | Free; Business $19.99/user/mo | Active | Coaching, not search staging |
| [Granola](https://www.granola.ai/) | Background transcription + your typed notes; "Ask anything" | Not stated | macOS, Win, iOS, Android | Free, paid for >30-day history | Active | After-the-fact notes |
| [Zoom Meeting questions](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0057748) | Ask about the meeting so far; web questions via AI Chat panel | Cloud | Zoom desktop | Plan-limited | Active | Reactive, Zoom only |
| [Ask Gemini in Meet](https://support.google.com/meet/answer/16024610?hl=en) | Private side panel, suggested prompts, captions-based | Cloud | Meet desktop/mobile | Business Plus+ ([expansion Jan 2026](https://workspaceupdates.googleblog.com/2026/01/ask-gemini-google-meet-expansion-business-standard.html)) | Active | Reactive, Meet only |
| [Copilot in Teams](https://support.microsoft.com/en-us/teams/copilot/catch-up-on-meetings-with-microsoft-365-copilot-in-teams) | Live Q&A over transcript; needs transcription on | Cloud | Teams | M365 Copilot | Active | Reactive, org-internal only |
| [Interview Coder](https://www.interviewcoder.co/) | Transcribes interviewer audio in real time; answers | Not stated | Win, Mac | Free; $299/mo; $799 lifetime | Active | Interview-only, on-demand |
| [HintMint](https://hintmint.io/) | Live transcript, "What should I say?", Analyze Screen | Not stated | Win, macOS | $29.99/mo, $249.99/yr | Active | Same as Cluely |
| [Omi](https://www.omi.me/) (OSS, [13.9k stars](https://api.github.com/repos/BasedHardware/omi)) | Live transcript on Pro; recaps after; "Run it locally" option | Mixed (cloud recording quota) | iOS, Android, Mac, web + $129 device | Free; Pro $29.99/mo | Pushed 2026-11-09 | Memory, not staged lookup |
| [Bee](https://www.bee.computer/) | Summaries/to-dos after; AI runs on AWS; Amazon acquiring ([BuiltIn](https://builtin.com/articles/amazon-bee-acquisition-20250723)) | Cloud | Wrist device + iOS/Android | $74.99 device + Pro | Active | After-the-fact |
| Limitless | Meta acquired Dec 2025; pendant sales stopped, Rewind desktop wound down ([BetaNews](https://betanews.com/2025/12/08/meta-has-acquired-limitless-a-startup-that-produces-ai-powered-wearables/)) | Cloud | — | — | Exiting | Vacates the privacy niche |
| Humane | Shut down 2025-02-28 after HP bought assets ([TechSpot](https://www.techspot.com/news/106833-humane-shuts-down-ai-pin-business-hp-buys.html)) | — | — | — | Dead | — |
| [Friend](https://friend.com) | Does not respond in real time; comments after the fact ([vantaige](https://vantaige.io/ai-tool/friend)) | Cloud (Gemini) | Pendant | $129 | Active | Companion, not lookup |
| Plaud Note Pro | Live raw transcript on OLED; summaries after cloud sync ([WebProNews](https://www.webpronews.com/plaud-note-pro-ai-device-with-real-time-transcription-launches-at-189)) | Cloud | Device | ~$189 + minutes | Active | Recorder |
| Pixel 10 Magic Cue | On-device Gemini Nano suggestions from Gmail/Calendar/Messages context ([DeepLearning.AI](https://www.deeplearning.ai/the-batch/inside-magic-cue-googles-new-ai-assistant-for-pixel-10)) | On-device | Pixel 10 only | Bundled | Active | Not from live audio (in-call surfacing unverified); Pixel-only |
| Apple Intelligence | Live Translation on-device in Phone/FaceTime ([AppleInsider](https://appleinsider.com/articles/25/06/11/new-ios-26-translation-tool-works-inside-calls-chats-video)); no conversation-suggestion feature found | On-device | iPhone 15 Pro+ | — | — | No lookup from conversation |
| Meta Ray-Ban Live AI | Continuous session; Meta says proactive suggestions "eventually" ([TechCrunch mirror](https://steamdeveloper.pages.dev/2024/12/16/meta-updates-its-smart-glasses-with-real-time-ai-video/)) | Cloud | Glasses | — | Active | Not shipped as proactive |
| Media-mode apps | PodiBud answers questions about the episode while listening ([App Store](https://apps.apple.com/us/app/podibud-an-ai-podcast-buddy/id6717603132)); Particle clips podcasts into news feed ([TechCrunch](https://techcrunch.com/2026/02/23/particles-ai-news-app-listens-to-podcasts-for-interesting-clips-so-you-you-dont-have-to/)) | Cloud | iOS | — | — | In-app only; nothing listens to *any* playing media |

## (c) Building blocks

| Project | What | Stars / last push | License |
|---|---|---|---|
| [whisper.cpp](https://api.github.com/repos/ggml-org/whisper.cpp) | Local ASR, has a stream example | 55.1k / 2026-11-09 | MIT |
| [WhisperLiveKit](https://api.github.com/repos/QuentinFuxa/WhisperLiveKit) | Real-time local STT, diarization, OpenAI-compatible API | 11.2k / 2026-11-08 | Apache-2.0 |
| [Moonshine](https://api.github.com/repos/moonshine-ai/moonshine) | Very-low-latency STT for edge | 11.4k / 2026-11-10 | Other |
| [ufal/whisper_streaming](https://api.github.com/repos/ufal/whisper_streaming) | Streaming policy for Whisper | 3.7k / 2025-11-12 | MIT |
| [Buzz](https://api.github.com/repos/chidiwilliams/buzz) | Offline desktop transcription | 22.6k / 2026-11-09 | MIT |
| [Vibe](https://api.github.com/repos/thewh1teagle/vibe) | Offline desktop transcription | 8.0k / 2026-10-30 | MIT |
| [screenpipe](https://api.github.com/repos/mediar-ai/screenpipe) | 24/7 screen+audio capture to local SQLite; now YC S26, pivoted to "company computer work" | 22.3k / 2026-11-10 | Other |
| [Rem](https://api.github.com/repos/jasonjmcghee/rem) | Mac local Rewind clone | 2.5k / last push 2024-05 (stale) | MIT |
| [OpenRecall](https://api.github.com/repos/openrecall/openrecall) | Open Recall alternative | 3.0k / 2025-09 | AGPL-3.0 |
| [Cheating Daddy](https://api.github.com/repos/sohzm/cheating-daddy) | OSS Cluely clone (Electron) | 5.7k / 2026-10-21 | GPL-3.0 |
| [Pickle Glass](https://github.com/pickle-com/glass) | Fork of Cheating Daddy; "listens in real time" ([ecosyste.ms](https://awesome.ecosyste.ms/projects/github.com%2Fpickle-com%2Fglass)) | ~4k | GPL-3.0 |
| [Pluely](https://github.com/iamsrikanthnani/pluely) | Tauri OSS Cluely alternative | — | — |
| [ibttf/interview-coder](https://api.github.com/repos/ibttf/interview-coder) | OSS interview overlay | 4.4k / 2025-09 | none |
| [Real_time_fallacy_detection](https://api.github.com/repos/latent-variable/Real_time_fallacy_detection) | Whisper + local LLM flagging fallacies live (closest OSS "listen and judge") | 120 / 2026-04 | MIT |
| [LiveWhisper](https://api.github.com/repos/Nikorasu/LiveWhisper) | Sentence-by-sentence live whisper + Wikipedia/weather assistant | 361 / 2025-07 | MIT |
| [ProactiveAgent](https://api.github.com/repos/thunlp/ProactiveAgent) | LLM agent that predicts tasks proactively | 690 / 2026-05 | Apache-2.0 |
| Dictation apps | [Superwhisper](https://superwhisper.com/) (local Whisper, Mac/Win/iOS/Android), [MacWhisper](https://macwhisper.com/) (€64 once, system-audio capture, local or Ollama), [Wispr Flow](https://wisprflow.ai/pricing) ($12–15/mo), [Aqua Voice](https://aquavoice.com/) (server-stored by default) | — | Dictation, not ambient |
| Windows Recall | Screen snapshots only, local, Copilot+ PCs ([MS Learn](https://learn.microsoft.com/en-us/windows/ai/recall/)) | — | No audio |

## (d) Prior-art notes

- **JITIR lineage:** Rhodes & Maes, "Just-in-time information retrieval agents," IBM Systems Journal 39(3.4), 2000; Remembrance Agent (Emacs, re-queries every 10/30 s), Margin Notes, Jimminy (wearable, physical-context notes) ([Rhodes](https://www.bradleyrhodes.com/Papers/wear-ra.html), [GT page](https://sites.cc.gatech.edu/fac/Thad.Starner/p/032_40_agents&ubicomp/remembrance-agent.html)). Rhodes 2003 "Using Physical Context for JITIR," IEEE Trans. Computers. These are 25-year-old public disclosures of continuous zero-query retrieval; the *room-conversation* version is below.
- **Andolina et al., "Investigating Proactive Search Support in Conversations," DIS 2018** ([DOI](https://doi.org/10.1145/3196709.3196734), [PDF](https://andolina.faculty.polimi.it/files/pdf/andolina2018searchbot.pdf)): agent listens to spoken conversation, extracts entities, retrieves web info; 24 participants; "reduced the need for explicit searching." Companion demo SearchBot, CSCW 2018. **This is the closest direct prior art to J-me's core loop.**
- **ProCIS** (Samarinas & Zamani, 2024, [arXiv](https://arxiv.org/abs/2405.06460)): 2.8M conversations; npDCG metric for *when* to retrieve.
- **Conv2Query** (Meng et al., SIGIR 2025, [arXiv](https://arxiv.org/abs/2506.00983)): converts long conversational context into short ad-hoc queries, i.e. the query-staging step.
- **LlamaPIE** (Chen, Gollakota et al., ACL 2025 Findings, [arXiv](https://arxiv.org/abs/2505.04066)): proactive in-ear assistant, on-device on M2, small model decides when to speak, large model answers.
- **2026 timing work:** "Do Proactive Agents Need an LLM to Decide When to Act?" ([arXiv 2605.30152](https://arxiv.org/html/2605.30152v2)) and Pare ([arXiv 2604.00842](https://arxiv.org/html/2604.00842)), which argues proactive assistants "should ideally be deployed as on-device models."
- **Patents:** US11914644B2 (Microsoft, granted 2024) suggests NL queries from a live or recorded meeting transcript, "generated live during the meeting" ([Google Patents](https://patents.google.com/patent/US11914644B2/en)); US12079292B1 (Google, 2024) proactive query suggestions from web change events, no audio ([Google Patents](https://patents.google.com/patent/US12079292B1/en)); US20250218440A1 (Sorenson, pub. 2025) live-transcript next-word prediction, refreshed as the transcript changes ([Google Patents](https://patents.google.com/patent/US20250218440A1/en)). **None describes decay/expiry of staged items**; MS '644 is the one to read in full (claims were beyond the fetched portion).
- Not found: the DOI 10.1145/3805712.3808361 "Evaluating Proactivity… Anticipatory Retrieval" could not be fetched (ACM 403) or located elsewhere.

## (e) Naming check

- **"Jamie" is taken in this exact space:** meetjamie.ai, Berlin, founded 2022, bot-free meeting notes, Win/Mac/iOS/web, €0 to $46/mo ([site](https://www.meetjamie.ai/), [pricing](https://www.meetjamie.ai/pricing)). Also a Microsoft Power Platform connector "Jamie AI" ([MS Learn](https://learn.microsoft.com/en-us/connectors/jamieai/)).
- USPTO: JAMIE Reg. 6441930 (Class 42, recruiting software, 2021) ([Justia](https://trademarks.justia.com/886/78/jamie-88678723.html)); JAIMIE Ser. 98623168 (Ylopo, AI chatbot, Classes 9/38/42, filed 2024) ([Justia](https://trademark.justia.com/986/23/jaimie-98623168.html)); JAMY Ser. 99732044 pending 2026 ([Markinton](https://markinton.com/trademark/jamy-99732044)). Aggregator data; confirm in TSDR/EUIPO.
- "JME/Jme" collides with jMonkeyEngine (which has its own "chat-jme" assistant, [GitHub](https://github.com/riccardobl/chat-jme)) and Java ME ([Wikipedia](https://en.wikipedia.org/wiki/JME)). The hyphenated "J-me" is pronounced identically to "Jamie," so likelihood-of-confusion risk with meetjamie.ai is real.

## (f) Recommendation

Spend time here only if the product is defined by the three things nobody ships together: in-room/media audio rather than video calls, a pre-staged queue that visibly decays, and everything but the web query staying on the device. Do not compete on meeting copilots; that market is reactive, cloud, and already has Zoom/Google/Microsoft plus a dozen Cluely clones. Build on WhisperLiveKit or whisper.cpp plus a small local "should I stage this" model in the LlamaPIE pattern, and treat Andolina 2018 and Microsoft US11914644B2 as the prior art to read before any filing. Pick a name other than J-me/Jamie, since meetjamie.ai is an active meeting-AI company and the hyphen does not change how it sounds. The media mode (a Jamie for podcasts and video) is the emptiest slot and the easiest to demo.
