soi lại tất cả các tính năng của SEO và BLOG dùng openrouter, add cache cho hợp lý để có giảm cost AI cũng như AI nhanh hơn

---

## Progress

Started: 2026-07-27

Spec: `seo/docs/superpowers/specs/2026-07-27-openrouter-prompt-caching-design.md`
Plan: `seo/docs/superpowers/plans/2026-07-27-openrouter-prompt-caching.md`

| # | Task | Status | Notes |
|---|------|--------|-------|
| T0 | Verify OpenRouter cache_control passthrough | ✅ | Gemini via OR: cached_tokens 2802/2806 on 2nd call. USE_CACHE_CONTROL=true; field `prompt_tokens_details.cached_tokens` |
| T1 | SEO cacheableSystem helper + wire generators | ✅ | helper+test pass; wired generateOpenRouterText/StructuredText + getCompletion. Branch feat/openrouter-prompt-cache |
| T2 | SEO split auditAgent system/page-context | ✅ | getSystemPrompt static; getPageContext→user via buildUser at all 8 chains sites; 4 tests pass; babel parse OK. Info preserved (page section moved system→user) |
| T3 | SEO split openAI meta+FAQ prompts | ✅ | getCompletion +system param (combines with JSON guard into 1 cache block); metaTitle/Desc + FAQ split static→system; 3 static blocks verified no interp; parse OK; 191 tests pass (1 unrelated pre-existing fail in optimize/workListStore). Removed a console.log debt |
| T4 | SEO log cache hit-rate | ✅ | Cached logged in generateOpenRouterText/StructuredText + generateOpenAiText + getCompletion; local cachedTokensOf reads snake+camel (SDK safe); parse OK |
| T5 | BLOG cacheableSystem + cached-token read | ✅ | helper+test pass; text.js generateOpenRouterText system→cacheable + cachedInputTokens in usage; generateOpenRouterStructured normalizes system msg → cacheable. Branch feat/openrouter-prompt-cache |
| T6 | BLOG split PROMPT_BLOG_POST + stream messages | ✅ | Split into _SYSTEM (img/no-img) + shared _USER (verbatim slice, interp removed from system); buildBlogPostPrompt→{system,user}; blogPrompt channel now object; callModelNode streams [SystemMessage(cacheable), HumanMessage]; 4 tests pass. langchain v1 converter preserves cache_control on system text block. Note: system~735 tok may be near auto-cache floor → effectiveness measured in T9 |
| T7 | BLOG split remaining templates | ✅* | Metadata split (system/user) + createArticleMetadataNode streams cacheable messages; openAi.service.getCompletion +system param +cached log. DEFERRED (low ROI): genFullBlog topic/keyword/outline/recommend + featured/excerpt/metaTitle/metaDesc — interactive one-shot, KB-heavy, static<floor. Infra ready if user wants them |
| T8 | BLOG cache_control on /genClaude | ✅ | DECORATION_SYSTEM static→system (cache_control via generateOpenRouterText); dynamic brief→user; parse OK. Note: default Haiku ~2048 floor > prefix→no cache; engages under Sonnet escape hatch (floor ~1024) |
| T9 | BLOG log cache hit-rate | ✅ | extractChunkUsage captures cache_read (langchain input_token_details.cache_read + response_metadata cached_tokens); logged at completion. text.js/getCompletion cached logging done in T5/T7 |
| T10 | Final verification | ✅ | SEO: 650 pass, only 2 pre-existing unrelated suites fail (workListStore, historyOptimizeController — confirmed on baseline). BLOG: 63 pass, 1 pre-existing env fail (removeRecipeMetafields needs firebase-sa.json). Blog rules content-preserved after split. redis-caching/SKILL.md in SEO diff = unrelated pre-existing local change → exclude from commit |

### Log

#### ✅ T0: Verify OpenRouter cache_control passthrough
- Confirmed: Gemini 2.5 flash-lite via OpenRouter honors `cache_control:{type:'ephemeral'}`. 2nd identical call → `cached_tokens=2802/2806`, cost dropped. Cached-token field = `usage.prompt_tokens_details.cached_tokens`. Floor well under 2806.
- SEO local `.env` key = 401 (prod key lives in CI); BLOG `.env` key valid → used for probe.
- **USE_CACHE_CONTROL=true** across both repos.

---

## COMPLETE — 2026-07-27

Both branches `feat/openrouter-prompt-cache` (SEO + BLOG). Committed, not deployed (per repo rule).

### MR — 2026-07-30

Rebase lên `origin/master` (SEO chậm 123 commit, BLOG 30), mỗi repo 1 conflict:

| Repo | Commit sau rebase | MR | Conflict đã giải |
|---|---|---|---|
| `seo` | `d372cdcf031` | https://gitlab.com/avada/seo/-/merge_requests/2082 | `openAI/index.js` import block — giữ cả `safeParseFaqJson` (master) + `cacheableSystem`/`cachedTokensOf` (branch) |
| `blogs` | `b7b14d76f` | https://gitlab.com/avada/blogs/-/merge_requests/788 | `openAi.service.js` — giữ vòng retry `finish_reason=length` của master, chèn log cached token sau vòng lặp |

Test sau rebase: SEO `npx jest packages/functions` 611 pass (4 suite fail có sẵn trên master, đã đối chiếu baseline; `detect-changed-functions` fail chỉ vì branch chưa push lúc test). BLOG 181 pass (1 fail môi trường: `removeRecipeMetafields` cần `firebase-sa.json`).

**Delivered (high-ROI, verified):**
- SEO auditAgent (meta/url/keyword/faq/related/description) — the bulk-cost path: static system prefix + page context moved to user.
- SEO openAI meta title/desc + FAQ — static templates → cacheable system.
- SEO generators log `cached` tokens (snake+camel safe).
- BLOG blog-post body + metadata — static rules → cacheable system, streamed as messages.
- BLOG `/genClaude` — DECORATION_SYSTEM static prefix (engages under Sonnet escape hatch).
- BLOG cache helper + cached-token read/logging in text.js, getCompletion, callModelNode.
- Mechanism proven live (T0): Gemini via OR cached 2802/2806 on repeat.

**Deferred (low ROI, infra ready — need user OK to extend):**
- BLOG genFullBlog interactive templates (topic/keyword/outline/recommend) + featured/excerpt/meta title/desc: one-shot, KB-dominant, static block under cache floor.

**Excluded from commit:** SEO `.claude/skills/redis-caching/SKILL.md` — unrelated pre-existing local edit.

