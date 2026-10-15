import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import {
  Studio,
  formatAmount,
  ROUTER,
  TOKENS,
  type Asset,
  type Proposal,
} from "./domain";
import { PracticeGateway } from "./practice";
import { WalletGateway, type Provider } from "./wallet";
import { registerStudio } from "./sdk";
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
const labels = { ETH: "Ether", USDC: "USD Coin", WETH: "Wrapped Ether" };
const serializable = (v: unknown) =>
  JSON.parse(
    JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)),
  );
declare global {
  interface Window {
    ethereum?: Provider;
    __STUDIO_TEST__?: {
      provider: import("./fixture").FixtureProvider;
      state: () => unknown;
      propose: (r: import("./domain").Request) => Promise<unknown>;
    };
  }
}
export function App() {
  const [studio, setStudio] = useState(
    () => new Studio(new PracticeGateway(), undefined, true),
  );
  useSyncExternalStore(studio.subscribe, studio.snapshot);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [agentStatus, setAgentStatus] = useState("Starting"),
    [selected, setSelected] = useState<string>(),
    [kind, setKind] = useState<"transfer" | "swap">("swap"),
    [asset, setAsset] = useState<Asset>("USDC"),
    [amount, setAmount] = useState("25"),
    [recipient, setRecipient] = useState(""),
    [slippage, setSlippage] = useState("50"),
    [fixture, setFixture] = useState<import("./fixture").FixtureProvider>();
  const [limits, setLimits] = useState({
    maxETH: "0.1",
    maxUSDC: "100",
    maxWETH: "0.1",
  });
  useEffect(() => {
    if (import.meta.env.MODE === "test")
      import("./fixture").then(({ FixtureProvider }) =>
        setFixture(new FixtureProvider()),
      );
  }, []);
  useEffect(() => {
    let active = true;
    const kit = registerStudio(studio);
    kit
      .ready()
      .then(() => {
        if (active)
          setAgentStatus(
            "modelContext" in document
              ? "Available · proposals only"
              : "Local tools ready",
          );
      })
      .catch(() => {
        if (active) setAgentStatus("Browser connection unavailable");
      });
    if (studio.practice) studio.connect().catch((e) => setError(String(e)));
    const timer = setInterval(() => studio.tick(), 1000);
    const provider =
      studio.gateway instanceof WalletGateway
        ? studio.gateway.provider
        : undefined;
    const changed = () => {
      studio.invalidate();
      setSelected(undefined);
      setNotice(
        "Wallet changed. Proposals were invalidated. Reconnect to continue.",
      );
    };
    for (const event of ["accountsChanged", "chainChanged", "disconnect"])
      provider?.on?.(event, changed);
    if (import.meta.env.MODE === "test" && fixture)
      window.__STUDIO_TEST__ = {
        provider: fixture,
        state: () =>
          serializable({
            practice: studio.practice,
            context: studio.context,
            policy: studio.policy,
            proposals: studio.list(),
          }),
        propose: async (request) => serializable(await studio.propose(request)),
      };
    return () => {
      active = false;
      kit.unregisterAll();
      clearInterval(timer);
      for (const event of ["accountsChanged", "chainChanged", "disconnect"])
        provider?.removeListener?.(event, changed);
    };
  }, [studio, fixture]);
  const act = async (fn: () => Promise<unknown> | unknown) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const changeMode = (practice: boolean) => {
    if (practice === studio.practice) return;
    let next: Studio;
    if (practice) next = new Studio(new PracticeGateway(), undefined, true);
    else {
      const provider = fixture ?? window.ethereum;
      if (!provider) {
        setError(
          "No injected wallet found. Install or open an EIP-1193 browser wallet to use live Base.",
        );
        return;
      }
      next = new Studio(new WalletGateway(provider));
    }
    next.setPolicy({ ...studio.policy });
    studio.invalidate();
    setSelected(undefined);
    setError("");
    setLimits({
      maxETH: next.policy.maxETH,
      maxUSDC: next.policy.maxUSDC,
      maxWETH: next.policy.maxWETH,
    });
    setNotice(
      "Mode changed. Your saved policy is preserved; unsaved limit edits were discarded.",
    );
    setStudio(next);
  };
  const connect = () =>
    act(async () => {
      if (studio.gateway instanceof WalletGateway)
        await studio.gateway.connect();
      await studio.connect();
      setNotice("Wallet connected. Review every action before authorizing it.");
    });
  const propose = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      const p = await studio.propose({
        kind,
        asset,
        amount,
        ...(kind === "transfer"
          ? { recipient }
          : { slippageBps: Number(slippage) }),
      });
      setSelected(p.id);
      setNotice(
        `${p.id} added to your proposal inbox. Nothing has been signed.`,
      );
      document
        .getElementById("inbox")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const pending = studio
    .list()
    .filter((p) => ["proposed", "review"].includes(p.status));
  const current = selected
    ? studio.list().find((p) => p.id === selected)
    : undefined;
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a className="brand" href="#main">
          <span className="brand-mark">w.</span>
          <span>
            WebMCP<span className="brand-small">STUDIO</span>
          </span>
        </a>
        <div className="side-section">YOUR WORKSPACE</div>
        <nav aria-label="Workspace">
          <a href="#main" className="active">
            <span aria-hidden="true">◈</span> Overview
          </a>
          <a href="#compose">
            <span aria-hidden="true">⇄</span> Transfer & trade
          </a>
          <a href="#inbox">
            <span aria-hidden="true">▣</span> Proposal inbox{" "}
            <span className="count">{pending.length}</span>
          </a>
          <a href="#activity">
            <span aria-hidden="true">◷</span> Activity
          </a>
          <a href="#policy">
            <span aria-hidden="true">◇</span> Your policy
          </a>
        </nav>
        <div className="side-bottom">
          <span className="status-dot" /> Human authority, always
          <p>
            Agents propose.
            <br />
            You decide. Your wallet signs.
          </p>
          <a href="#guide">Read the quick guide ↗</a>
          <div className="side-version">REFERENCE APP · BASE</div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Workspace <span className="crumb">/ Overview</span>
          </span>
          <div className="header-controls">
            <span className="network">
              <span className="base-icon" /> Base · 8453
            </span>
            <button
              className="wallet-button"
              onClick={connect}
              disabled={busy || studio.practice}
            >
              {studio.practice
                ? "Practice wallet"
                : studio.context
                  ? short(studio.context.account)
                  : "Connect wallet"}{" "}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </header>
        <main id="main">
          <section className="page-heading">
            <div>
              <span className="eyebrow">
                A LITTLE INTELLIGENCE. ALL YOUR CONTROL.
              </span>
              <h1>Your wallet. Your decision.</h1>
              <p>
                A clear place to review what your agent proposes and decide what
                happens next.
              </p>
            </div>
            <div
              className="mode-switch"
              role="group"
              aria-label="Workspace mode"
            >
              <button
                aria-pressed={studio.practice}
                disabled={busy}
                onClick={() => changeMode(true)}
              >
                Practice
              </button>
              <button
                aria-pressed={!studio.practice}
                disabled={busy}
                onClick={() => changeMode(false)}
              >
                Live wallet
              </button>
            </div>
          </section>
          <div className={`mode-banner ${studio.practice ? "" : "live"}`}>
            <span className="banner-icon" aria-hidden="true">
              {studio.practice ? "✧" : "◇"}
            </span>
            <div>
              <strong>
                {studio.practice
                  ? "Practice makes confident."
                  : fixture
                    ? "Deterministic test wallet — no real funds."
                    : "Live on Base. Real assets, external wallet."}
              </strong>
              <span>
                {studio.practice
                  ? "These balances, prices and receipts are simulated. Explore freely; no wallet needed."
                  : "Each approval and transaction requires your review and a separate wallet authorization."}
              </span>
            </div>
            <a href="#guide">How it works ↗</a>
          </div>
          <div
            role="alert"
            className={error ? "message error" : "message empty"}
          >
            {error}
          </div>
          <div
            role="status"
            className={notice ? "message notice" : "message empty"}
          >
            {notice}
          </div>
          <section aria-labelledby="balances-title">
            <div className="section-title">
              <h2 id="balances-title">
                {studio.practice ? "Practice balances" : "Wallet balances"}
              </h2>
              <button
                className="text-button"
                onClick={() => act(() => studio.refresh())}
                disabled={busy || !studio.context}
              >
                Refresh ↻
              </button>
            </div>
            <div className="balances">
              {(["USDC", "ETH", "WETH"] as const).map((a, index) => (
                <article className="balance-card" key={a}>
                  <div className={`asset-icon asset-${a}`} aria-hidden="true">
                    {a === "USDC" ? "$" : "◇"}
                  </div>
                  <div>
                    <span className="balance-name">
                      {labels[a]} <span>{a}</span>
                    </span>
                    <strong>
                      {studio.balance
                        ? formatAmount(studio.balance[a], a)
                        : "—"}{" "}
                      <small>{a}</small>
                    </strong>
                    <span className="balance-caption">
                      {studio.practice
                        ? "SIMULATED BALANCE"
                        : studio.context
                          ? "ON BASE · WALLET RPC"
                          : "CONNECT TO VIEW"}
                    </span>
                  </div>
                  <span className="asset-number" aria-hidden="true">
                    0{index + 1}
                  </span>
                </article>
              ))}
            </div>
          </section>
          <div className="work-grid">
            <section
              className="panel composer"
              id="compose"
              aria-labelledby="compose-title"
            >
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">MAKE YOUR NEXT MOVE</span>
                  <h2 id="compose-title">Create a proposal</h2>
                </div>
                <span className="pill">Review first</span>
              </div>
              <div className="tabs" role="group" aria-label="Action type">
                <button
                  aria-pressed={kind === "swap"}
                  onClick={() => {
                    setKind("swap");
                    if (asset === "ETH") setAsset("USDC");
                  }}
                >
                  Swap assets
                </button>
                <button
                  aria-pressed={kind === "transfer"}
                  onClick={() => setKind("transfer")}
                >
                  Send a transfer
                </button>
              </div>
              <form onSubmit={propose}>
                <div className="amount-field">
                  <label htmlFor="amount">
                    {kind === "swap" ? "You pay" : "You send"}
                  </label>
                  <div className="amount-row">
                    <input
                      id="amount"
                      inputMode="decimal"
                      autoComplete="off"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      aria-describedby="amount-help"
                      maxLength={80}
                    />
                    <label className="sr-only" htmlFor="asset">
                      Asset
                    </label>
                    <select
                      id="asset"
                      value={asset}
                      onChange={(e) => setAsset(e.target.value as Asset)}
                    >
                      {(kind === "swap"
                        ? ["USDC", "WETH"]
                        : ["USDC", "ETH", "WETH"]
                      ).map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <span id="amount-help" className="field-help">
                    Available:{" "}
                    {studio.balance
                      ? formatAmount(studio.balance[asset], asset)
                      : "—"}{" "}
                    {asset}
                    {studio.practice ? " · practice" : ""}
                  </span>
                </div>
                {kind === "swap" ? (
                  <>
                    <div className="swap-divider" aria-hidden="true">
                      ↓
                    </div>
                    <div className="receive-field">
                      <span>You receive</span>
                      <strong>{asset === "USDC" ? "WETH" : "USDC"}</strong>
                      <p>
                        {studio.practice
                          ? "Illustrative practice rate"
                          : "Live quote from Uniswap V3"}{" "}
                        · exact amount shown in review
                      </p>
                    </div>
                    <div className="inline-field">
                      <label htmlFor="slippage">Maximum price movement</label>
                      <select
                        id="slippage"
                        value={slippage}
                        onChange={(e) => setSlippage(e.target.value)}
                      >
                        <option value="10">0.1%</option>
                        <option value="50">0.5%</option>
                        <option value="100">1.0%</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <label className="stacked" htmlFor="recipient">
                    Recipient wallet address
                    <input
                      id="recipient"
                      required
                      placeholder="0x…"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      maxLength={42}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                )}
                <div className="form-summary">
                  <span>
                    Network <strong>Base mainnet</strong>
                  </span>
                  <span>
                    {kind === "swap" ? "Pool fee" : "Supported assets"}
                    <strong>
                      {kind === "swap"
                        ? "0.05% · Uniswap V3"
                        : "ETH / USDC / WETH"}
                    </strong>
                  </span>
                  <span>
                    Proposal expires <strong>After 2 minutes</strong>
                  </span>
                </div>
                <button
                  className="primary full"
                  type="submit"
                  disabled={busy || !studio.context || !studio.policy.enabled}
                >
                  {busy
                    ? "Working…"
                    : kind === "swap"
                      ? "Get quote & propose swap"
                      : "Propose transfer"}{" "}
                  <span aria-hidden="true">→</span>
                </button>
                <p className="footnote">
                  Creating a proposal never moves your funds.
                </p>
              </form>
            </section>
            <section
              className="panel inbox"
              id="inbox"
              aria-labelledby="inbox-title"
            >
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">THE HUMAN CHECKPOINT</span>
                  <h2 id="inbox-title">
                    Proposal inbox{" "}
                    <span className="heading-count">{pending.length}</span>
                  </h2>
                </div>
                <span className="pill green">You are in control</span>
              </div>
              <p className="muted">
                Your agent can suggest a move. Only you can authorize it.
              </p>
              {pending.length === 0 && !current ? (
                <div className="empty-inbox">
                  <div className="inbox-art" aria-hidden="true">
                    <span>✓</span>
                  </div>
                  <h3>A clear inbox. A clear head.</h3>
                  <p>
                    Create a proposal on the left, or ask a connected agent to
                    suggest a transfer or swap.
                  </p>
                  <span className="small-label">NO AUTOMATIC TRANSACTIONS</span>
                </div>
              ) : (
                <>
                  <div className="proposal-list">
                    {pending.map((p) => (
                      <button
                        key={p.id}
                        className={`proposal-row ${selected === p.id ? "selected" : ""}`}
                        onClick={() => setSelected(p.id)}
                      >
                        <span className="proposal-symbol" aria-hidden="true">
                          {p.intent.kind === "swap" ? "⇄" : "↗"}
                        </span>
                        <span>
                          <strong>
                            {p.intent.kind === "swap" ? "Swap" : "Send"}{" "}
                            {formatAmount(p.intent.amount, p.intent.asset)}{" "}
                            {p.intent.asset}
                          </strong>
                          <small>
                            {p.id} ·{" "}
                            {p.status === "review"
                              ? "Ready for your review"
                              : "Awaiting review"}{" "}
                            · expires{" "}
                            {new Date(p.intent.expires).toLocaleTimeString()}
                          </small>
                        </span>
                        <span aria-hidden="true">→</span>
                      </button>
                    ))}
                  </div>
                  {current && (
                    <ReviewPanel
                      key={`${current.id}-${current.review?.step}-${current.review?.generation}-${current.status}`}
                      proposal={current}
                      studio={studio}
                      busy={busy}
                      act={act}
                    />
                  )}
                </>
              )}
              <div className="agent-status">
                <span className="status-dot" />
                <span>
                  Agent connection <strong>{agentStatus}</strong>
                </span>
                <span className="small-label">READ + PROPOSE</span>
              </div>
            </section>
          </div>
          <div className="bottom-grid">
            <section className="panel" id="activity">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">EVERY STEP, VISIBLE</span>
                  <h2>Activity</h2>
                </div>
                <span className="pill">This session</span>
              </div>
              {studio.list().length === 0 ? (
                <div className="activity-empty">
                  <span aria-hidden="true">◷</span>
                  <p>
                    No activity yet.
                    <small>
                      Your proposals and wallet outcomes will appear here.
                    </small>
                  </p>
                </div>
              ) : (
                <ol className="activity-list">
                  {studio.list().map((p) => (
                    <li key={p.id}>
                      <span className={`activity-dot ${p.status}`} />
                      <div>
                        <strong>
                          {studio.practice ? "Practice · " : ""}
                          {p.intent.kind === "swap" ? "Swap" : "Transfer"}{" "}
                          {formatAmount(p.intent.amount, p.intent.asset)}{" "}
                          {p.intent.asset}
                        </strong>
                        <span>
                          {p.id} · {p.status}
                          {p.approvalHash ? " · exact approval confirmed" : ""}
                        </span>
                        {p.error && <p>{p.error}</p>}
                        {p.hash && !studio.practice && (
                          <a
                            href={`https://basescan.org/tx/${p.hash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View submitted transaction ↗
                          </a>
                        )}
                        {p.hash && studio.practice && (
                          <small>
                            Simulated receipt · no blockchain transaction
                          </small>
                        )}
                        {p.status === "pending" && (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => act(() => studio.checkReceipt(p.id))}
                          >
                            Check receipt
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="panel" id="policy">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">YOUR GUARDRAILS</span>
                  <h2>Proposal policy</h2>
                </div>
                <span className="pill">v{studio.policyVersion}</span>
              </div>
              <p className="muted">
                Limit each proposal. These limits do not cap your total spending
                across multiple proposals.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(() => {
                    studio.setPolicy({
                      ...limits,
                      enabled: studio.policy.enabled,
                    });
                    setNotice(
                      "Policy updated. Earlier proposals were invalidated.",
                    );
                  });
                }}
              >
                <div className="policy-limits">
                  {(["USDC", "ETH", "WETH"] as const).map((a) => (
                    <label key={a} htmlFor={`limit-${a}`}>
                      {a} limit
                      <input
                        id={`limit-${a}`}
                        inputMode="decimal"
                        value={limits[`max${a}`]}
                        onChange={(e) =>
                          setLimits({ ...limits, [`max${a}`]: e.target.value })
                        }
                        required
                        maxLength={80}
                      />
                    </label>
                  ))}
                </div>
                <div className="policy-footer">
                  <button className="secondary" type="submit" disabled={busy}>
                    Save limits
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        studio.setPolicy({
                          ...studio.policy,
                          enabled: !studio.policy.enabled,
                        }),
                      )
                    }
                  >
                    {studio.policy.enabled
                      ? "Pause proposals"
                      : "Resume proposals"}
                  </button>
                </div>
              </form>
              <div className="policy-note">
                <span aria-hidden="true">◇</span> Every action requires human
                review. Slippage is capped at 1%. No unlimited approvals.
              </div>
            </section>
          </div>
          <section className="guide" id="guide">
            <div>
              <span className="eyebrow">A QUICK GUIDE</span>
              <h2>Confidence, before confirmation.</h2>
              <p>
                Your keys stay in your wallet. Studio never asks for a recovery
                phrase or private key.
              </p>
            </div>
            <div className="guide-steps">
              <article>
                <span>01</span>
                <h3>Propose</h3>
                <p>
                  Start in practice or connect an injected wallet on Base. Ask
                  an agent or create a proposal yourself.
                </p>
              </article>
              <article>
                <span>02</span>
                <h3>Review</h3>
                <p>
                  Check network, address, amount, minimum output and fees. A
                  simulation can detect failures; it cannot guarantee the
                  future.
                </p>
              </article>
              <article>
                <span>03</span>
                <h3>Authorize</h3>
                <p>
                  Approve only the exact token amount when needed, then
                  separately review and sign the trade. Approval can remain even
                  if a trade expires.
                </p>
              </article>
            </div>
            <details>
              <summary>What to know about fees, deadlines and receipts</summary>
              <p>
                Live support is Base (8453) only: ETH, native USDC and WETH
                transfers; USDC/WETH swaps through Uniswap V3's 0.05% pool.
                Missing liquidity makes the quote fail. No bridge, testnet
                trading, native ETH swaps or price guarantees are offered.
              </p>
              <p>
                Fees shown are the execution gas cap. Base can also charge an L1
                data fee; review the final fee in your wallet. Slippage sets
                your minimum accepted output; it does not protect against an
                unfavorable initial price. Quotes expire after 120 seconds and
                swaps include an onchain deadline. Standard transfers and
                approvals have no onchain expiry after submission.
              </p>
              <p>
                A submitted hash is pending. Studio verifies successful
                inclusion, exact transaction fields and token events before
                showing confirmed. Inclusion is not irreversible finality:
                reorganization and untrusted wallet RPC remain risks. Check your
                wallet or Base explorer after a timeout. Do not blindly retry.
              </p>
              <p>
                Practice uses an invented rate of 2,500 USDC per WETH. Session
                history stays in memory and clears on reload or mode change.
                Retain pending hashes before leaving. Account or network changes
                invalidate unsubmitted proposals. Cancelling a proposal cannot
                revoke a transaction already submitted to your wallet. Existing
                sufficient allowances are reused and may outlive a proposal.
              </p>
              <p>
                Contracts: USDC <code>{TOKENS.USDC}</code>; WETH{" "}
                <code>{TOKENS.WETH}</code>; router <code>{ROUTER}</code>.{" "}
                <a
                  href="https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments"
                  target="_blank"
                  rel="noreferrer"
                >
                  Uniswap deployments ↗
                </a>
              </p>
            </details>
          </section>
          <footer>
            <span className="footer-brand">
              w. <strong>WebMCP Studio</strong>
            </span>
            <span>Non-custodial by design. Human-controlled by default.</span>
            <a href="#main">Back to top ↑</a>
          </footer>
        </main>
      </div>
    </div>
  );
}
function ReviewPanel({
  proposal: p,
  studio,
  busy,
  act,
}: {
  proposal: Proposal;
  studio: Studio;
  busy: boolean;
  act: (fn: () => Promise<unknown> | unknown) => Promise<void>;
}) {
  const [checked, setChecked] = useState(false);
  const i = p.intent,
    can = ["proposed", "review"].includes(p.status);
  return (
    <div className="review-panel">
      <div className="review-heading">
        <strong>
          {p.review?.step === "approval"
            ? "Step 1 · Exact token approval"
            : i.kind === "swap"
              ? "Review swap"
              : "Review transfer"}
        </strong>
        <span className="pill">{studio.practice ? "Practice" : p.status}</span>
      </div>
      <dl>
        <div>
          <dt>Network</dt>
          <dd>Base mainnet · 8453</dd>
        </div>
        <div>
          <dt>From wallet</dt>
          <dd className="address">{i.account}</dd>
        </div>
        <div>
          <dt>{i.kind === "swap" ? "Router" : "Recipient"}</dt>
          <dd className="address">
            {i.kind === "swap" ? ROUTER : i.recipient}
          </dd>
        </div>
        <div>
          <dt>Exact amount</dt>
          <dd>
            {formatAmount(i.amount, i.asset)} {i.asset}
          </dd>
        </div>
        {i.output && (
          <>
            <div>
              <dt>Quoted output</dt>
              <dd>
                {formatAmount(i.quote!, i.output)} {i.output}
              </dd>
            </div>
            <div>
              <dt>Minimum received</dt>
              <dd>
                {formatAmount(i.minimum!, i.output)} {i.output}
              </dd>
            </div>
            <div>
              <dt>Slippage limit</dt>
              <dd>{i.slippageBps / 100}%</dd>
            </div>
            <div>
              <dt>Output recipient</dt>
              <dd className="address">{i.account}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Expires</dt>
          <dd>{new Date(i.expires).toLocaleTimeString()}</dd>
        </div>
        <div>
          <dt>Approval</dt>
          <dd>
            {i.kind === "transfer"
              ? "Not required"
              : p.approvalHash
                ? "Exact approval confirmed"
                : p.review?.step === "execute"
                  ? "Existing allowance covers amount"
                  : `${formatAmount(i.amount, i.asset)} ${i.asset} to router; separate step if needed`}
          </dd>
        </div>
        {p.review && (
          <>
            <div>
              <dt>
                {p.review.step === "approval" ? "Approval" : "Transaction"} gas
                cap
              </dt>
              <dd>{formatAmount(p.review.feeCap, "ETH")} ETH</dd>
            </div>
            <div>
              <dt>Additional fee</dt>
              <dd>
                {studio.practice
                  ? "Simulated only"
                  : "L1 data fee shown by wallet"}
              </dd>
            </div>
          </>
        )}
      </dl>
      {p.review?.step === "approval" && (
        <p className="review-warning">
          This permits the router to spend exactly{" "}
          {formatAmount(i.amount, i.asset)} {i.asset}. It does not execute the
          swap. Review the trade separately after approval confirms. Unused
          approval may remain.
        </p>
      )}
      {can && (
        <>
          <div className="review-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => act(() => studio.prepare(p.id))}
            >
              {p.review ? "Refresh simulation" : "Simulate & review"}
            </button>
            <button
              className="text-button danger"
              disabled={busy}
              onClick={() => act(() => studio.cancel(p.id))}
            >
              Reject proposal
            </button>
          </div>
          {p.review && (
            <>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />{" "}
                I reviewed the network, address, exact amount and fees
                {p.review.step === "approval" ? " for this approval" : ""}.
              </label>
              <button
                className="primary full"
                disabled={busy || !checked}
                onClick={() => act(() => studio.execute(p.id))}
              >
                {studio.practice
                  ? "Confirm practice "
                  : "Authorize in wallet · "}
                {p.review.step === "approval"
                  ? "exact approval"
                  : i.kind === "swap"
                    ? "swap"
                    : "transfer"}{" "}
                →
              </button>
            </>
          )}
        </>
      )}
      {!can && (
        <p className="muted">
          This proposal is {p.status}.{" "}
          {p.status === "confirmed" && studio.practice
            ? "This is a simulated outcome."
            : ""}
        </p>
      )}
    </div>
  );
}
