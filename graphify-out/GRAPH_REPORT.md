# Graph Report - .  (2026-06-18)

## Corpus Check
- Corpus is ~34,721 words - fits in a single context window. You may not need a graph.

## Summary
- 483 nodes · 853 edges · 28 communities (19 shown, 9 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.85)
- Token cost: 42,000 input · 3,200 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Frontend Dashboard & N8n Hooks|Frontend Dashboard & N8n Hooks]]
- [[_COMMUNITY_Plugin Runtime & Notifications|Plugin Runtime & Notifications]]
- [[_COMMUNITY_Backend Dependencies|Backend Dependencies]]
- [[_COMMUNITY_NestJS App Module & Controllers|NestJS App Module & Controllers]]
- [[_COMMUNITY_Auth Module|Auth Module]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Calendar & Docker Infrastructure|Calendar & Docker Infrastructure]]
- [[_COMMUNITY_Frontend App Pages|Frontend App Pages]]
- [[_COMMUNITY_Scheduler & BullMQ Jobs|Scheduler & BullMQ Jobs]]
- [[_COMMUNITY_Frontend TypeScript Config|Frontend TypeScript Config]]
- [[_COMMUNITY_Backend Dev Dependencies|Backend Dev Dependencies]]
- [[_COMMUNITY_Backend TypeScript Config|Backend TypeScript Config]]
- [[_COMMUNITY_App Shell & Sidebar Layout|App Shell & Sidebar Layout]]
- [[_COMMUNITY_Settings & Health Check|Settings & Health Check]]
- [[_COMMUNITY_E2E Test Config|E2E Test Config]]
- [[_COMMUNITY_NestJS CLI Config|NestJS CLI Config]]
- [[_COMMUNITY_Seed Data|Seed Data]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_Install Script|Install Script]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Next.js Config Mjs|Next.js Config Mjs]]
- [[_COMMUNITY_Jest E2E Config|Jest E2E Config]]
- [[_COMMUNITY_Backend TSConfig Root|Backend TSConfig Root]]
- [[_COMMUNITY_Next.js Types|Next.js Types]]
- [[_COMMUNITY_PostCSS Root|PostCSS Root]]

## God Nodes (most connected - your core abstractions)
1. `PluginsService` - 29 edges
2. `N8nService` - 22 edges
3. `SchedulerService` - 20 edges
4. `Plugin` - 18 edges
5. `api (axios instance)` - 18 edges
6. `compilerOptions` - 17 edges
7. `NotificationsService` - 15 edges
8. `ScheduledJob` - 15 edges
9. `useToast()` - 15 edges
10. `compilerOptions` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Design tokens (dark palette)` --references--> `ToastProvider()`  [INFERRED]
  docs/superpowers/specs/2026-06-18-autohub-design.md → frontend/src/components/ui/Toast.tsx
- `Test Runbook` --references--> `useCreateSchedule()`  [INFERRED]
  dev-logs/testings.md → frontend/src/lib/hooks/useSchedules.ts
- `Design tokens (dark palette)` --references--> `StatusBadge()`  [INFERRED]
  docs/superpowers/specs/2026-06-18-autohub-design.md → frontend/src/components/ui/StatusBadge.tsx
- `AutoHub Frontend Plan` --references--> `ToastProvider()`  [EXTRACTED]
  docs/superpowers/plans/2026-06-18-autohub-frontend.md → frontend/src/components/ui/Toast.tsx
- `AutoHub Frontend Plan` --references--> `Plugin`  [EXTRACTED]
  docs/superpowers/plans/2026-06-18-autohub-frontend.md → frontend/src/lib/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Authentication Subsystem** — auth_auth_controller_authcontroller, auth_auth_service_authservice, auth_auth_module_authmodule, auth_strategies_jwt_jwtstrategy, auth_guards_jwtauthguard_jwtauthguard, auth_decorators_public_ispublickey [EXTRACTED 1.00]
- **N8n Integration Subsystem** — n8n_n8n_controller_n8ncontroller, n8n_n8n_service_n8nservice, n8n_n8n_module_n8nmodule [EXTRACTED 1.00]
- **Dashboard Subsystem** — dashboard_dashboard_controller_dashboardcontroller, dashboard_dashboard_service_dashboardservice, dashboard_dashboard_module_dashboardmodule [EXTRACTED 1.00]
- **NestJS Application Root** — main_bootstrap, app_module_appmodule, auth_auth_module_authmodule, health_health_module_healthmodule, dashboard_dashboard_module_dashboardmodule, n8n_n8n_module_n8nmodule, notifications_notifications_module_notificationsmodule [EXTRACTED 1.00]
- **Plugin execution flow: SchedulerService triggers PluginJobProcessor which calls PluginsService.run() and sends Telegram notification on result** — scheduler_scheduler_service_schedulerservice, scheduler_processors_plugin_job_processor_pluginjobprocessor, plugins_plugins_service_pluginsservice, notifications_notifications_service_notificationsservice, plugins_entities_plugin_execution_pluginexecution [INFERRED 0.95]
- **E2E test suite covers plugins, schedules, auth, dashboard, and n8n bridge** — test_app_e2e_spec_autohub_e2e, plugins_plugins_service_pluginsservice, plugins_plugins_controller_pluginscontroller, scheduler_scheduler_service_schedulerservice, scheduler_scheduler_controller_schedulercontroller, notifications_notifications_service_notificationsservice [EXTRACTED 1.00]
- **Components using Modal for dialogs** — components_plugins_configmodal_configmodal, components_plugins_schedulemodal_schedulemodal, app_app_schedules_page_deleteconfirmmodal, components_ui_modal_modal [EXTRACTED 1.00]
- **Main application pages rendered within AppShell** — app_app_page_dashboardpage, app_app_plugins_page_pluginspage, app_app_schedules_page_schedulespage, app_app_calendar_page_calendarpage, app_app_n8n_workflows_page_n8nworkflowspage, app_app_settings_page_settingspage, components_layout_appshell_appshell [EXTRACTED 1.00]
- **Global providers wrapping the app** — app_layout_rootlayout, app_providers_providers, components_layout_appshell_appshell [EXTRACTED 1.00]
- **React Query hooks layer** — hooks_usedashboard_usedashboard, hooks_usehealth_usehealth, hooks_usen8nworkflows_usen8nworkflows, hooks_usen8nworkflows_useactivateworkflow, hooks_usen8nworkflows_usedeactivateworkflow, hooks_useplugins_useplugins, hooks_useplugins_useplugin, hooks_useplugins_useexecutions, hooks_useplugins_userunplugin, hooks_useplugins_usetoggleplugin, hooks_useplugins_useupdatepluginconfig, hooks_useschedules_useschedules, hooks_useschedules_usecreateschedule, hooks_useschedules_usedeleteschedule, hooks_useschedules_usetoggleschedule [INFERRED 0.95]
- **Shared frontend type contracts** — lib_types_plugin, lib_types_pluginexecution, lib_types_scheduledjob, lib_types_n8nworkflow, lib_types_dashboarddata, lib_types_healthdata [EXTRACTED 1.00]
- **Frontend Vitest test suite** — frontend_vitest_config, frontend_vitest_setup, ui_statusbadge_test_statusbadge_test, ui_toast_test_toast_test, utils_cron_test_cron_test [EXTRACTED 1.00]
- **Docker Compose service graph** — docker_compose_stack, specs_design_raspberry_pi_target, specs_design_cloudflare_zero_trust, scripts_install_installer [EXTRACTED 1.00]
- **Design and planning documentation** — specs_design_autohub_design, plans_backend_backend_plan, plans_frontend_frontend_plan, readme_autohub, devlogs_testings_test_runbook [INFERRED 0.95]

## Communities (28 total, 9 thin omitted)

### Community 0 - "Frontend Dashboard & N8n Hooks"
Cohesion: 0.07
Nodes (51): DashboardPage(), useDashboard(), useActivateWorkflow(), useDeactivateWorkflow(), useN8nWorkflows(), useExecutions(), usePlugin(), usePlugins() (+43 more)

### Community 1 - "Plugin Runtime & Notifications"
Cohesion: 0.08
Nodes (19): Seed plugins script, Plugin runtime execution, Telegram notification integration, ConfigSchemaItem, Plugin, PluginStatus, ExecutionStatus, PluginExecution (+11 more)

### Community 2 - "Backend Dependencies"
Cohesion: 0.04
Nodes (44): dependencies, axios, bcrypt, bullmq, class-transformer, class-validator, ioredis, @nestjs/axios (+36 more)

### Community 3 - "NestJS App Module & Controllers"
Cohesion: 0.09
Nodes (12): AppModule, DashboardController, DashboardModule, DashboardService, DashboardService (spec), bootstrap (main.ts), N8nController, N8nModule (+4 more)

### Community 4 - "Auth Module"
Cohesion: 0.08
Nodes (17): AuthController, AuthModule, AuthService, AuthService (spec), IS_PUBLIC_KEY / Public decorator, JwtAuthGuard, JwtStrategy, Public() (+9 more)

### Community 5 - "Frontend Dependencies"
Cohesion: 0.05
Nodes (36): dependencies, axios, date-fns, lucide-react, next, react, react-dom, @tanstack/react-query (+28 more)

### Community 6 - "Calendar & Docker Infrastructure"
Cohesion: 0.09
Nodes (22): CalendarPage(), useCalendar(), Test Runbook, config, CalendarData, AutoHub Backend Plan, AutoHub Frontend Plan, AutoHub README (+14 more)

### Community 7 - "Frontend App Pages"
Cohesion: 0.11
Nodes (24): CalendarPage, DayPopover, useCalendar hook, AppLayout, N8nWorkflowsPage, DashboardPage, PluginsPage, DeleteConfirmModal (+16 more)

### Community 8 - "Scheduler & BullMQ Jobs"
Cohesion: 0.16
Nodes (8): BullMQ job queue, ScheduledJob, ScheduledJob entity, PluginJobProcessor, SchedulerController, SchedulerModule, SchedulerService, SchedulerService (unit tests)

### Community 9 - "Frontend TypeScript Config"
Cohesion: 0.10
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 10 - "Backend Dev Dependencies"
Cohesion: 0.11
Nodes (18): devDependencies, jest, @nestjs/cli, @nestjs/schematics, @nestjs/testing, source-map-support, supertest, ts-jest (+10 more)

### Community 11 - "Backend TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+9 more)

### Community 13 - "Settings & Health Check"
Cohesion: 0.36
Nodes (3): useHealth(), HealthData, SettingsPage()

### Community 14 - "E2E Test Config"
Cohesion: 0.29
Nodes (6): moduleFileExtensions, rootDir, testEnvironment, testRegex, transform, ^.+\\.(t|j)s$

### Community 15 - "NestJS CLI Config"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 17 - "Next.js Config"
Cohesion: 0.67
Nodes (3): Frontend ESLint config, Next.js config, Frontend package.json

## Knowledge Gaps
- **187 isolated node(s):** `$schema`, `collection`, `sourceRoot`, `deleteOutDir`, `name` (+182 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppModule` connect `NestJS App Module & Controllers` to `Backend Dependencies`, `Auth Module`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Backend Dev Dependencies` to `Backend Dependencies`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `$schema`, `collection`, `sourceRoot` to the rest of the system?**
  _187 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Dashboard & N8n Hooks` be split into smaller, more focused modules?**
  _Cohesion score 0.06846846846846846 - nodes in this community are weakly interconnected._
- **Should `Plugin Runtime & Notifications` be split into smaller, more focused modules?**
  _Cohesion score 0.08148148148148149 - nodes in this community are weakly interconnected._
- **Should `Backend Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `NestJS App Module & Controllers` be split into smaller, more focused modules?**
  _Cohesion score 0.08846153846153847 - nodes in this community are weakly interconnected._