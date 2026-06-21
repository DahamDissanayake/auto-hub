# Graph Report - .  (2026-06-21)

## Corpus Check
- 246 files · ~161,987 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1137 nodes · 1783 edges · 81 communities (63 shown, 18 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.82)
- Token cost: 444,666 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Terminal Service (sessionsPTY)|Terminal Service (sessions/PTY)]]
- [[_COMMUNITY_AutoHub Architecture & Security|AutoHub Architecture & Security]]
- [[_COMMUNITY_Files UI Components|Files UI Components]]
- [[_COMMUNITY_Files Service & App-Creator Docs|Files Service & App-Creator Docs]]
- [[_COMMUNITY_Docker Monitoring API|Docker Monitoring API]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Backend Dev Dependencies|Backend Dev Dependencies]]
- [[_COMMUNITY_Apps Launcher|Apps Launcher]]
- [[_COMMUNITY_Authentication (JWTLogin)|Authentication (JWT/Login)]]
- [[_COMMUNITY_Files Service Core (authpathtransfer)|Files Service Core (auth/path/transfer)]]
- [[_COMMUNITY_Settings & Health|Settings & Health]]
- [[_COMMUNITY_Files Service Dependencies|Files Service Dependencies]]
- [[_COMMUNITY_Terminal Controller (Claude Profiles)|Terminal Controller (Claude Profiles)]]
- [[_COMMUNITY_Dashboard Frontend|Dashboard Frontend]]
- [[_COMMUNITY_Backend Dependencies|Backend Dependencies]]
- [[_COMMUNITY_Dashboard API|Dashboard API]]
- [[_COMMUNITY_n8n Integration|n8n Integration]]
- [[_COMMUNITY_Claude Profile Manager|Claude Profile Manager]]
- [[_COMMUNITY_Slide-to-Confirm UX|Slide-to-Confirm UX]]
- [[_COMMUNITY_Scheduler|Scheduler]]
- [[_COMMUNITY_Frontend Root Layout|Frontend Root Layout]]
- [[_COMMUNITY_Frontend TS Config|Frontend TS Config]]
- [[_COMMUNITY_Backend TS Config|Backend TS Config]]
- [[_COMMUNITY_Calendar UI|Calendar UI]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]

## God Nodes (most connected - your core abstractions)
1. `DockerService` - 24 edges
2. `PluginsService` - 23 edges
3. `N8nService` - 19 edges
4. `useToast()` - 19 edges
5. `api` - 19 edges
6. `Plugin` - 18 edges
7. `compilerOptions` - 17 edges
8. `SettingsService` - 16 edges
9. `PluginExecution` - 15 edges
10. `ScheduledJob` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Design tokens (dark palette)` --references--> `StatusBadge()`  [INFERRED]
  docs/superpowers/specs/2026-06-18-autohub-design.md → frontend/src/components/ui/StatusBadge.tsx
- `Nginx /files-api/ Reverse Proxy` --references--> `Files Express App (index.ts)`  [INFERRED]
  nginx/nginx.conf → files/src/index.ts
- `DirEntry Type` --semantically_similar_to--> `filesApi (DirEntry, apiDownload)`  [INFERRED] [semantically similar]
  files/src/routes/ls.ts → frontend/src/lib/filesApi.ts
- `AutoHub Frontend Plan` --references--> `StatusBadge()`  [EXTRACTED]
  docs/superpowers/plans/2026-06-18-autohub-frontend.md → frontend/src/components/ui/StatusBadge.tsx
- `Design tokens (dark palette)` --references--> `ToastProvider()`  [INFERRED]
  docs/superpowers/specs/2026-06-18-autohub-design.md → frontend/src/components/ui/Toast.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Design and planning documentation** — specs_design_autohub_design, plans_backend_backend_plan, plans_frontend_frontend_plan, readme_autohub, devlogs_testings_test_runbook [INFERRED 0.95]
- **Files Backend Express Routes sharing resolveSafePath** — files_ls_concept, files_mkdir_concept, files_rename_concept, files_delete_concept, files_download_concept, files_upload_concept, files_resolvepath_concept [EXTRACTED 1.00]
- **SSE Transfer Progress Flow (upload to tray)** — files_upload_concept, files_transferstore_concept, files_events_concept, files_transfertray_concept, lib_transferstore_concept [INFERRED 0.85]
- **Files Page UI Composition** — files_page_concept, files_drivessidebar_concept, files_filebreadcrumb_concept, files_filegrid_concept, files_filelist_concept, files_contextmenu_concept, lib_usefiles_concept [EXTRACTED 1.00]
- **Files Browser Frontend Stack** — files_filesapi, files_transfer_store, files_usefiles_hook, files_drivessidebar [EXTRACTED 1.00]
- **Single-Credential Blast Radius to Root** — dev_logs_securitycheck1_single_credential, plans_terminal_service, auto_hub_backend, plans_host_control [EXTRACTED 1.00]
- **Web Terminal Proxy Chain (frontend→nginx→backend→terminal)** — auto_hub_frontend, auto_hub_nginx, plans_backend_terminal_controller, plans_terminal_service [EXTRACTED 0.95]
- **Files Upload Progress Flow** — plans_files_app_upload_busboy, plans_files_app_sse_events, plans_files_app_transfer_store_frontend, specs_files_app_transfer_tray [EXTRACTED 1.00]
- **Host Reboot Password-Gated Flow** — specs_host_control_plugin_action_confirm_modal, specs_host_control_plugin_plugins_service, specs_host_control_plugin_index, specs_host_control_plugin_docker_socket [EXTRACTED 1.00]
- **Terminal Persistent Session Lifecycle** — specs_terminal_sessions_tmux, specs_terminal_sessions_resurrect, specs_terminal_sessions_rest_endpoints, specs_terminal_sessions_session_manager [EXTRACTED 1.00]
- **SerenEdge Brand Identity Assets** — img_base_logo_dark, img_base_logo_light, img_og_page [INFERRED 0.85]

## Communities (81 total, 18 thin omitted)

### Community 0 - "Terminal Service (sessions/PTY)"
Cohesion: 0.06
Nodes (46): ALLOWED_DIRS, cp, { getSessions }, isValidCwd(), resurrect(), app, cp, express (+38 more)

### Community 1 - "AutoHub Architecture & Security"
Cohesion: 0.06
Nodes (53): AutoHub (Self-hosted Automation OS), Backend (NestJS), Cloudflare Tunnel / Zero Trust, Frontend (Next.js 14), n8n (Self-hosted Automation), Nginx Reverse Proxy, Plugin System (manifest.json + index.js), PostgreSQL 16 (+45 more)

### Community 2 - "Files UI Components"
Cohesion: 0.07
Nodes (29): FileBreadcrumb Component, File Drives (Internal/Workspace/Data), DRIVES, FileBreadcrumb(), joinPath(), FilesPage(), Toast, formatBytes() (+21 more)

### Community 3 - "Files Service & App-Creator Docs"
Cohesion: 0.06
Nodes (42): App Creator Guide, JWT authMiddleware (files), GET /download Streaming, files Express Container, filesApi fetch wrappers, GET /ls Directory Listing, mkdir / rename / delete Endpoints, nginx /files-api/ Proxy (+34 more)

### Community 4 - "Docker Monitoring API"
Cohesion: 0.07
Nodes (9): DockerController, DockerModule, ContainerInfo, DiskStats, DockerService, execAsync, NetworkStats, SpeedTestResult (+1 more)

### Community 5 - "Frontend Dependencies"
Cohesion: 0.05
Nodes (40): dependencies, axios, date-fns, date-fns-tz, lucide-react, next, react, react-dom (+32 more)

### Community 6 - "Backend Dev Dependencies"
Cohesion: 0.05
Nodes (39): devDependencies, jest, @nestjs/cli, @nestjs/schematics, @nestjs/testing, source-map-support, supertest, ts-jest (+31 more)

### Community 7 - "Apps Launcher"
Cohesion: 0.08
Nodes (19): AppEntry, apps, LUCIDE_ICONS, ContainerCard(), DockerMonitorPage(), fmtMb(), fmtPing(), healthDot() (+11 more)

### Community 8 - "Authentication (JWT/Login)"
Cohesion: 0.09
Nodes (12): AuthController, AuthModule, AuthService, Public(), JwtAuthGuard, JwtStrategy, executionsStore, pluginsStore (+4 more)

### Community 9 - "Files Service Core (auth/path/transfer)"
Cohesion: 0.12
Nodes (17): authMiddleware(), getRoots(), resolveSafePath(), TransferBus, TransferEvent, transferStore, router, router (+9 more)

### Community 10 - "Settings & Health"
Cohesion: 0.16
Nodes (6): AppSetting, HealthController, HealthModule, SettingsController, SettingsModule, SettingsService

### Community 11 - "Files Service Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, busboy, express, jsonwebtoken, devDependencies, jest, supertest, ts-jest (+16 more)

### Community 12 - "Terminal Controller (Claude Profiles)"
Cohesion: 0.09
Nodes (11): ClaudeProfilesMeta, CloneBody, CompleteLoginBody, CreateSessionBody, DirEntry, LABEL_MAP, RepoEntry, SessionEntry (+3 more)

### Community 13 - "Dashboard Frontend"
Cohesion: 0.15
Nodes (16): DashboardPage(), useDashboard(), useActivateWorkflow(), useDeactivateWorkflow(), useN8nWorkflows(), DashboardData, N8nWorkflow, N8nWorkflowsPage() (+8 more)

### Community 14 - "Backend Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, axios, bcrypt, bullmq, class-transformer, class-validator, ioredis, @nestjs/axios (+16 more)

### Community 15 - "Dashboard API"
Cohesion: 0.15
Nodes (9): DashboardController, DashboardModule, DashboardService, ConfigSchemaItem, PluginAction, PluginStatus, ExecutionStatus, PluginExecution (+1 more)

### Community 16 - "n8n Integration"
Cohesion: 0.16
Nodes (3): N8nController, N8nModule, N8nService

### Community 17 - "Claude Profile Manager"
Cohesion: 0.17
Nodes (21): activateProfile(), bootstrapActiveProfile(), CLAUDE_DIR, CLAUDE_JSON_PATH, CREDENTIALS_PATH, deleteProfile(), ensureProfilesDir(), fs (+13 more)

### Community 18 - "Slide-to-Confirm UX"
Cohesion: 0.10
Nodes (22): SlideToConfirm Component, Slide-to-Confirm Implementation Plan, Rationale: prevent accidental deletion, SessionManager (destructive button), SessionTabs (close button), AddAccountModal OAuth Flow, Claude Code Profile Switcher, profiles/meta.json Credential Store (+14 more)

### Community 19 - "Scheduler"
Cohesion: 0.18
Nodes (3): ScheduledJob, SchedulerController, SchedulerService

### Community 20 - "Frontend Root Layout"
Cohesion: 0.14
Nodes (13): metadata, viewport, Providers(), config, AutoHub Frontend Plan, Design tokens (dark palette), ToastTrigger(), ToastContext (+5 more)

### Community 21 - "Frontend TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 22 - "Backend TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+9 more)

### Community 23 - "Calendar UI"
Cohesion: 0.22
Nodes (11): CalendarTab(), SchedulesTab(), Tab, useCalendarData(), usePlugins(), useDeleteSchedule(), useSchedules(), useToggleSchedule() (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.19
Nodes (6): RealIpThrottlerGuard, NotificationsModule, PluginsModule, PluginJobProcessor, SchedulerModule, AppModule

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (16): dependencies, express, jsonwebtoken, node-pty, ws, devDependencies, jest, supertest (+8 more)

### Community 26 - "Community 26"
Cohesion: 0.23
Nodes (7): CloneDialog(), CloneDialogProps, Repo, RepoPicker(), RepoPickerProps, Settings, api

### Community 27 - "Community 27"
Cohesion: 0.18
Nodes (15): GET /events SSE Stream Route, TransferEvent Type, TransferRow Component, transferStore EventEmitter Bus, TransferTray Component, POST /upload Busboy Streaming Route, AppShell Layout, useTransferStore Zustand Store (+7 more)

### Community 28 - "Community 28"
Cohesion: 0.21
Nodes (10): useCreateSchedule(), buildCron(), FREQUENCIES, FrequencyType, ScheduleModal(), ScheduleModalProps, Modal(), ModalProps (+2 more)

### Community 29 - "Community 29"
Cohesion: 0.16
Nodes (6): AppShell(), MobileNav(), MobileNavProps, navItems, navItems, sessionStorageMock

### Community 30 - "Community 30"
Cohesion: 0.20
Nodes (9): AddAccountModal(), AddAccountModalProps, ModalStep, ProfileButton(), ClaudeProfile, ClaudeProfilesState, mockApi, PROFILES_DATA (+1 more)

### Community 32 - "Community 32"
Cohesion: 0.24
Nodes (14): authMiddleware JWT Bearer Validator, DELETE /delete Route, GET /download Streaming Route, Files Express App (index.ts), GET /ls Route, POST /mkdir Route, POST /rename Route, resolveSafePath Path Traversal Guard (+6 more)

### Community 33 - "Community 33"
Cohesion: 0.22
Nodes (10): useRunPlugin(), PluginAction, ActionConfirmModal(), Props, rebootAction, CATEGORY_META, DEFAULT_META, PluginCard() (+2 more)

### Community 34 - "Community 34"
Cohesion: 0.19
Nodes (9): useTimezone(), ConfigSchemaItem, DashboardStats, ExecutionStatus, HealthData, PluginExecution, PluginStatus, TriggerType (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, lib, module, outDir, resolveJsonModule, rootDir, skipLibCheck (+4 more)

### Community 36 - "Community 36"
Cohesion: 0.23
Nodes (7): TimezoneContext, TimezoneProvider(), useHealth(), useSettings(), useUpdateSettings(), SettingsPage(), TIMEZONE_OPTIONS

### Community 37 - "Community 37"
Cohesion: 0.23
Nodes (12): ContextMenu Component, DrivesSidebar Component, FileBreadcrumb Component, FileGrid Component, FileList Component, FilesPage Component, DirEntry Type, filesApi (DirEntry, apiDownload) (+4 more)

### Community 38 - "Community 38"
Cohesion: 0.24
Nodes (5): useUpdatePluginConfig(), Plugin, ConfigModal(), ConfigModalProps, basePlugin

### Community 40 - "Community 40"
Cohesion: 0.18
Nodes (11): apps.config.ts Registry, Files Container Dockerfile, Nginx /files-api/ Reverse Proxy, Files App Final Review Fix Report, Nginx Upload Size Limit + Request Buffering Fix, Files App Feature, Task 12: Files Page + App Registration + Nav, Task 12 Report (+3 more)

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (8): WorkspacePicker(), WorkspacePickerProps, KEY_DEFS, KeyDef, PasteFeedback, Repo, Step, Workspace

### Community 42 - "Community 42"
Cohesion: 0.18
Nodes (10): actions, category, configSchema, description, entryFile, icon, name, requiresPassword (+2 more)

### Community 43 - "Community 43"
Cohesion: 0.27
Nodes (6): CreateSessionDialog(), CreateSessionDialogProps, Session, SessionManager(), SessionManagerProps, mockApi

### Community 44 - "Community 44"
Cohesion: 0.27
Nodes (6): SessionTabs(), SessionTabsProps, tabs, SlideToConfirm(), SlideToConfirmProps, defaultProps

### Community 45 - "Community 45"
Cohesion: 0.31
Nodes (6): gridCols(), GridView(), GridViewProps, TabSession, TerminalCell(), TerminalCellProps

### Community 46 - "Community 46"
Cohesion: 0.22
Nodes (9): Claude Code Profile Switcher, SDD Progress Tracker, Host Control Plugin, Slide-to-Confirm Feature, System/Containers Page, Terminal claude User, Repo Picker & Clone Flow, Terminal Persistent Sessions, Timezone Settings (+1 more)

### Community 47 - "Community 47"
Cohesion: 0.22
Nodes (8): category, configSchema, description, entryFile, icon, name, slug, version

### Community 48 - "Community 48"
Cohesion: 0.22
Nodes (8): category, configSchema, description, entryFile, icon, name, slug, version

### Community 49 - "Community 49"
Cohesion: 0.48
Nodes (6): AutoHub Backend Plan, AutoHub — self-hosted automation OS, AutoHub Design Spec, Cloudflare Zero Trust tunnel, Plugin system, Raspberry Pi 5 / ARM64 target

### Community 51 - "Community 51"
Cohesion: 0.29
Nodes (6): moduleFileExtensions, rootDir, testEnvironment, testRegex, transform, ^.+\\.(t|j)s$

### Community 52 - "Community 52"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 53 - "Community 53"
Cohesion: 0.50
Nodes (3): TerminalBreadcrumb(), TerminalBreadcrumbProps, WORKSPACE_LABELS

### Community 54 - "Community 54"
Cohesion: 0.50
Nodes (4): useAllExecutions(), ShortcutsPage(), Tab, TIME_RANGES

### Community 55 - "Community 55"
Cohesion: 0.40
Nodes (3): fs, http, path

### Community 56 - "Community 56"
Cohesion: 0.50
Nodes (5): docker/page.tsx (System/Containers UI), DockerService, getNetworkStats / NetworkStats, runSpeedTest / speedtest-cli, useDockerMonitor Hook

### Community 57 - "Community 57"
Cohesion: 0.40
Nodes (5): AppSetting Entity / SettingsService, date-fns-tz formatInTimeZone, Timezone Settings Design, Expanded HealthController, useSettings / TimezoneContext

### Community 58 - "Community 58"
Cohesion: 0.40
Nodes (3): REMOVED_SLUGS, SeedPlugin, seedPlugins

### Community 59 - "Community 59"
Cohesion: 0.67
Nodes (4): SerenEdge Base Logo (Dark), SerenEdge Base Logo (Light), SerenEdge Open Graph Page Image, SoterCare Banner

### Community 61 - "Community 61"
Cohesion: 0.50
Nodes (3): LANG, LC_ALL, entrypoint.sh script

## Ambiguous Edges - Review These
- `Web Terminal (Sub-system 1) Design Spec` → `Web Terminal (Sub-system 1) Design Spec`  [AMBIGUOUS]
  docs/superpowers/specs/2026-06-20-web-terminal-design.md · relation: references

## Knowledge Gaps
- **421 isolated node(s):** `moduleFileExtensions`, `rootDir`, `testEnvironment`, `testRegex`, `^.+\\.(t|j)s$` (+416 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Web Terminal (Sub-system 1) Design Spec` and `Web Terminal (Sub-system 1) Design Spec`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `filesApi Wrappers` connect `AutoHub Architecture & Security` to `Files UI Components`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `api` connect `Community 26` to `Community 34`, `Community 38`, `Apps Launcher`, `Community 41`, `Community 43`, `Dashboard Frontend`, `Calendar UI`, `Community 30`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `moduleFileExtensions`, `rootDir`, `testEnvironment` to the rest of the system?**
  _427 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Terminal Service (sessions/PTY)` be split into smaller, more focused modules?**
  _Cohesion score 0.05660377358490566 - nodes in this community are weakly interconnected._
- **Should `AutoHub Architecture & Security` be split into smaller, more focused modules?**
  _Cohesion score 0.06313497822931785 - nodes in this community are weakly interconnected._
- **Should `Files UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.0726950354609929 - nodes in this community are weakly interconnected._