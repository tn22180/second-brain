---
description: Security audit focused on Shopify app security and OWASP Top 10
argument-hint: [files or feature to audit]
---

Perform a security audit on the code I'm discussing or the files I specify, focusing on Shopify app security and OWASP Top 10.

**Reference:** `.claude/skills/security/SKILL.md`

## Security Checklist

### Authentication & Authorization
- [ ] All endpoints require proper authentication
- [ ] Users can only access their own data (no IDOR)
- [ ] Shop-scoped data access enforced
- [ ] Session tokens properly validated
- [ ] OAuth implementation follows Shopify standards

### OWASP Top 10
- [ ] **Injection**: SQL/NoSQL injection, parameterized queries
- [ ] **Broken Auth**: Token validation, session management
- [ ] **Sensitive Data Exposure**: PII handling, encryption
- [ ] **XXE**: XML parsing security
- [ ] **Broken Access Control**: Authorization checks
- [ ] **Security Misconfiguration**: Headers, CORS, TLS
- [ ] **XSS**: Input sanitization, output encoding
- [ ] **Insecure Deserialization**: Safe parsing
- [ ] **Vulnerable Components**: Outdated dependencies
- [ ] **Insufficient Logging**: Audit trails

### Shopify-Specific
- [ ] Webhook HMAC verification implemented
- [ ] App proxy signature verification
- [ ] No exposed API keys or secrets
- [ ] Mandatory webhooks subscribed (customers/data_request, customers/redact, shop/redact)
- [ ] GDPR compliance mechanisms
- [ ] Multi-tenant data isolation

### Data Protection
- [ ] No credentials in code/logs
- [ ] .env files gitignored
- [ ] Firestore security rules configured
- [ ] Customer PII secured

## Output Format

1. **Risk Level**: Critical / High / Medium / Low
2. **Findings by Severity**:
   - Critical: Immediate fix required
   - High: Fix before deployment
   - Medium: Should address soon
   - Low: Minor improvements
3. **Specific Locations**: File paths and line numbers
4. **Remediation**: Code examples for fixes
5. **Quick Wins**: Easy fixes to implement now
