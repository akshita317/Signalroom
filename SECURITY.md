# Security Notes

- Never commit `.env`, Freshdesk API keys, passwords, or real customer data.
- API keys stay server-side and are sent to Freshdesk using Basic authentication in the form `base64(apiKey:X)`.
- The browser talks only to the local connector routes; it never receives the API key.
- The exposed tool registry is read-only (four tools, all annotated `readOnlyHint`). Unsupported names such as `update_ticket`, `delete_ticket`, or `refund_customer` are rejected before any provider call.
- Search filter values are validated against enums, a date format, and a tag allowlist before being placed in the Freshdesk query, which prevents query injection.
- Agent-facing output masks requester emails and redacts emails and phone numbers in descriptions (`FRESHDESK_REDACT_PII`).
- `FRESHDESK_DOMAIN` must be a `*.freshdesk.com` host, so a misconfiguration cannot send the API key elsewhere.
- Mock records use `example.test` addresses and fictional content.
- Production deployment should use a secret manager, HTTPS, strict CORS, authentication and authorization at the connector boundary, structured audit logs with redaction, request size limits, and tenant-specific credentials.
- Do not paste ticket content into external debugging tools or commit captured API responses.