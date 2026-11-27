# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability (such as SSRF bypasses in `api/audit.ts` or `api/badge.ts`, command injection, or dependency issues), please report it privately via GitHub Security Advisories or email the maintainer directly rather than opening a public issue.

## Scope

- `api/audit.ts` and `api/badge.ts` enforce host/IPv4/IPv6 SSRF blocks against loopback, link-local, and private network ranges.
- The CLI runs locally without transmitting audit data to third-party servers.
