# Security Policy

## Supported Versions

CodeHandover is currently pre-release. Security fixes are applied to the main development branch until the first stable release is published.

## Reporting a Vulnerability

Please report security issues privately before opening a public issue. Include:

- A clear description of the vulnerability.
- Steps to reproduce it.
- Whether credentials, repository URLs, generated documents, or local files may be exposed.
- The operating system and Git version used during reproduction.

Avoid sharing real repository tokens, production `.env` files, generated handover documents, or private source code in public reports.

## Credential Handling

Remote repository tokens are passed to Git through a temporary HTTP authorization header. CodeHandover resets the cloned repository `origin` URL after cloning so tokens are not written into `.git/config`.

Generated handover documents may include source-derived paths, method names, table names, route paths, and business notes. Review the output before sharing it outside your organization.

