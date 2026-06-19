# App Creator Guide

How to add a new app to the Apps launcher in AutoHub.

## Where apps are defined

All apps live in one file:

```
frontend/src/app/(app)/apps/apps.config.ts
```

Open it and add an entry to the `apps` array.

## AppEntry fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier, e.g. `"portainer"` |
| `name` | `string` | Yes | Display name shown on the card |
| `description` | `string` | Yes | Short description (1-2 sentences) |
| `url` | `string` | Yes | Full URL the card links to |
| `iconPath` | `string` | No | Path to icon relative to `/public`, e.g. `"/img/icons/portainer.png"` |
| `color` | `string` | No | Hex accent colour for the icon background, e.g. `"#13BEF9"`. Defaults to `#3b82f6` |

## Example entry

```ts
{
  id: 'portainer',
  name: 'Portainer',
  description: 'Docker container management UI',
  url: 'http://homelab.local:9000',
  iconPath: '/img/icons/portainer.png',
  color: '#13BEF9',
}
```

## Adding an icon

1. Drop a PNG or SVG into `frontend/public/img/icons/`
2. Recommended size: 64×64 px (displayed at 28×28)
3. Set `iconPath` to `"/img/icons/<filename>"`

If no `iconPath` is set, the card shows the first letter of the app name as a coloured initial.

## What counts as an "app"

Anything with a URL:
- Internal Docker services (e.g. Portainer, Grafana, Home Assistant)
- Local tools running on the network
- External web apps or dashboards
- Raspberry Pi services

## Rebuilding after changes

The config is compiled into the Next.js build. In development (`npm run dev`) changes hot-reload instantly. In production, rebuild and redeploy the frontend container after editing `apps.config.ts`.
