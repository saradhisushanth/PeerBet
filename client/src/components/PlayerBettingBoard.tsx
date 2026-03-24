import { useCallback, useLayoutEffect, useRef } from "react";
import {
  DndContext,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { COIN_SYMBOL, formatCurrency, formatNumber } from "../utils/format";

/** Shared by undecided column so chip rows align with team columns */
const BETTING_COLUMN_HEADER_STRIP =
  "flex min-w-0 shrink-0 flex-col gap-2 border-b pb-2.5 mb-2.5 overflow-hidden min-h-[2.75rem] sm:min-h-[2.125rem] sm:flex-row sm:items-center sm:gap-2";

/** Home / away: title + pool centred in the column */
const TEAM_COLUMN_HEADER_STRIP =
  "flex min-w-0 shrink-0 flex-col items-center justify-center gap-2 border-b pb-2.5 mb-2.5 overflow-hidden text-center min-h-[2.75rem] sm:min-h-[2.125rem] sm:flex-row sm:items-center sm:justify-center sm:gap-2";

/**
 * Only chips (or titles) that actually overflow at `basePx` get a smaller font.
 * Short labels stay at the base size — no stretching to column width.
 */
function FittedOneLineText({
  text,
  className = "",
  basePx = 14,
  minPx = 9,
  /** Use full parent width (e.g. flex header). Otherwise width follows content up to max-width — only overflowing chips shrink. */
  fillParent = false,
}: {
  text: string;
  className?: string;
  basePx?: number;
  minPx?: number;
  fillParent?: boolean;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  const fit = useCallback(() => {
    const wrap = wrapRef.current;
    const el = textRef.current;
    if (!wrap || !el) return;
    el.style.whiteSpace = "nowrap";
    el.style.fontSize = `${basePx}px`;
    const available = wrap.clientWidth;
    // Wait for real layout width (avoid shrinking when width is still 0)
    if (available < 4) return;
    // Fits at base — leave at basePx (this chip is not "overflown")
    if (el.scrollWidth <= available + 0.5) return;
    let size = basePx;
    while (el.scrollWidth > available && size > minPx) {
      size -= 0.25;
      el.style.fontSize = `${size}px`;
    }
  }, [text, basePx, minPx]);

  useLayoutEffect(() => {
    fit();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <span
      ref={wrapRef}
      className={
        fillParent
          ? "block min-w-0 w-full max-w-full overflow-hidden"
          : "inline-block min-w-0 max-w-full align-middle"
      }
    >
      <span ref={textRef} className={`inline-block leading-tight ${className}`} style={{ fontSize: basePx }}>
        {text}
      </span>
    </span>
  );
}

type BoardData = {
  homeTeam: { id: string; shortName: string; name: string };
  awayTeam: { id: string; shortName: string; name: string };
  onHome: { userId: string; username: string; amount: number; insured?: boolean }[];
  onAway: { userId: string; username: string; amount: number; insured?: boolean }[];
  undecided: { userId: string; username: string }[];
};

function PlayerChip({
  userId,
  username,
  amount,
  insured = false,
  isMe,
  draggable = false,
  onSide = false,
  /** Middle / undecided column: show username only (no stake row). */
  nameOnly = false,
}: {
  userId: string;
  username: string;
  amount?: number;
  insured?: boolean;
  isMe: boolean;
  draggable?: boolean;
  onSide?: boolean;
  nameOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `player-${userId}`,
    data: { userId, username, amount: amount ?? 0 },
    disabled: !draggable,
  });

  const nameLine = username;
  const stakeLine = amount != null ? formatCurrency(amount) : "—";
  const titleFull =
    amount != null
      ? `${nameLine} · ${formatCurrency(amount)}${insured ? " · insured" : ""}`
      : `${nameLine}${insured ? " · insured" : ""}`;

  const dragHint = onSide ? "Drag to change team or drop in the middle to remove" : "Drag to a team column or the middle to remove your bet";

  const stakeRowClass = (t: "read" | "drag") => {
    if (t === "read") {
      return isMe
        ? "text-rose-800 border-rose-200/80"
        : "text-slate-600 border-slate-200/90";
    }
    if (isDragging) return "text-white border-white/25";
    if (isMe) return "text-white border-white/30";
    return "text-slate-700 border-slate-300/80";
  };

  if (!draggable) {
    if (nameOnly) {
      return (
        <span
          title={nameLine}
          className={`inline-flex max-w-full min-w-0 items-center gap-1.5 px-2.5 py-1 rounded-lg align-middle ${isMe ? "bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-400/90" : "bg-slate-100 text-slate-700"}`}
        >
          <span className="min-w-0 max-w-full">
            <FittedOneLineText text={nameLine} basePx={14} minPx={9} />
          </span>
        </span>
      );
    }
    return (
      <span
        title={titleFull}
        className={`inline-flex max-w-full min-w-0 items-start gap-1.5 px-2.5 py-1.5 rounded-lg align-top ${isMe ? "bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-400/90" : "bg-slate-100 text-slate-700"}`}
      >
        <span className="flex min-w-0 max-w-full flex-col items-stretch gap-1">
          <span className="min-w-0 leading-tight">
            <FittedOneLineText text={nameLine} basePx={14} minPx={9} />
          </span>
          <span
            className={`block w-full min-w-0 border-t pt-1 text-right text-sm font-bold tabular-nums tracking-tight ${stakeRowClass("read")}`}
          >
            {stakeLine}
          </span>
        </span>
        {insured && <span className="shrink-0 text-amber-400" title="Insured — get refund if you lose">🛡</span>}
      </span>
    );
  }
  if (nameOnly) {
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        data-draggable-chip
        title={`${nameLine}. ${dragHint}`}
        className={`inline-flex max-w-full min-w-0 items-center px-2.5 sm:px-3 py-2 min-h-[44px] rounded-lg select-none cursor-grab active:cursor-grabbing ${
          isDragging
            ? "bg-rose-500/85 z-50 cursor-grabbing text-white ring-2 ring-inset ring-white/45 shadow-inner opacity-90"
            : isMe
              ? "bg-rose-500 text-white ring-2 ring-inset ring-white/50 hover:bg-rose-600 active:bg-rose-600"
              : "bg-slate-200 text-slate-800 hover:bg-slate-300 active:bg-slate-300"
        }`}
        style={{ touchAction: "none", cursor: "grab", pointerEvents: "auto" }}
      >
        <span style={{ pointerEvents: "none" }} className="min-w-0 max-w-full text-left">
          <FittedOneLineText
            text={nameLine}
            basePx={14}
            minPx={9}
            className={isDragging ? "text-white" : isMe ? "text-white" : ""}
          />
        </span>
      </div>
    );
  }
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-draggable-chip
      title={`${titleFull}. ${dragHint}`}
      className={`inline-flex max-w-full min-w-0 items-start px-2.5 sm:px-3 py-2 min-h-[44px] min-w-0 rounded-lg select-none cursor-grab active:cursor-grabbing ${
        isDragging
          ? "bg-rose-500/85 z-50 cursor-grabbing text-white ring-2 ring-inset ring-white/45 shadow-inner opacity-90"
          : isMe
            ? "bg-rose-500 text-white ring-2 ring-inset ring-white/50 hover:bg-rose-600 active:bg-rose-600"
            : "bg-slate-200 text-slate-800 hover:bg-slate-300 active:bg-slate-300"
      }`}
      style={{ touchAction: "none", cursor: "grab", pointerEvents: "auto" }}
    >
      <span style={{ pointerEvents: "none" }} className="flex min-w-0 max-w-full items-start gap-1.5">
        <span className="flex min-w-0 max-w-full flex-col items-stretch gap-1 text-left">
          <span className="min-w-0 leading-tight">
            <FittedOneLineText
              text={nameLine}
              basePx={14}
              minPx={9}
              className={isDragging ? "text-white" : isMe ? "text-white" : ""}
            />
          </span>
          <span
            className={`block w-full min-w-0 border-t pt-1 text-right text-sm font-bold tabular-nums tracking-tight ${stakeRowClass("drag")}`}
          >
            {stakeLine}
          </span>
        </span>
        {insured && isMe && <span className="shrink-0 text-amber-300" title="Insured">🛡</span>}
      </span>
    </div>
  );
}

/** Put the logged-in player first in the list. */
function sortWithMeFirst<T extends { userId: string }>(
  list: T[],
  currentUserId: string | null
): T[] {
  if (!currentUserId) return list;
  return [...list].sort((a, b) =>
    a.userId === currentUserId ? -1 : b.userId === currentUserId ? 1 : 0
  );
}

function DroppableZone({
  id,
  title,
  poolTotal,
  players,
  currentUserId,
  canDrag,
  className,
  isWinner = false,
  alignWithWinnerStrip = false,
}: {
  id: string;
  title: string;
  poolTotal?: number;
  players: { userId: string; username: string; amount: number; insured?: boolean }[];
  currentUserId: string | null;
  canDrag: boolean;
  className?: string;
  isWinner?: boolean;
  /** When the match has a winner on the other column, reserve the same top band so headers line up */
  alignWithWinnerStrip?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const sorted = sortWithMeFirst(players, currentUserId);
  const headerSep = isWinner ? "border-emerald-200/90" : isOver ? "border-rose-200/90" : "border-slate-200";
  const vBar = isWinner ? "bg-emerald-300/60" : isOver ? "bg-rose-300/60" : "bg-slate-300/70";
  const winnerTopBand = (
    <div className="flex shrink-0 justify-center border-b border-emerald-200/80 bg-emerald-100/35 px-3 py-1">
      <span
        role="status"
        className="inline-flex rounded-full border border-emerald-300/90 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-800 shadow-sm leading-tight"
        aria-label="Match winner"
      >
        Winner
      </span>
    </div>
  );
  const winnerStripSpacer = (
    <div
      className="flex shrink-0 justify-center border-b border-transparent px-3 py-1"
      aria-hidden
    >
      <span className="invisible inline-flex rounded-full border border-transparent px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] leading-tight">
        Winner
      </span>
    </div>
  );
  return (
    <div className={`h-full min-w-0 ${className ?? ""}`}>
      <div
        ref={setNodeRef}
        className={`flex h-full min-h-[100px] min-w-0 flex-col overflow-hidden rounded-xl border-2 transition-colors ${
          isWinner ? "border-emerald-400 bg-emerald-50" : isOver ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white"
        }`}
      >
        {isWinner ? winnerTopBand : alignWithWinnerStrip ? winnerStripSpacer : null}
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col px-3 pb-3 ${isWinner ? "pt-2" : "pt-3"}`}
        >
        <div className={`shrink-0 ${TEAM_COLUMN_HEADER_STRIP} ${headerSep}`}>
          <h3
            className={`min-w-0 min-h-[1.125rem] w-full overflow-hidden text-center font-semibold leading-tight sm:w-auto sm:max-w-full sm:min-w-0 ${isWinner ? "text-emerald-600" : "text-slate-500"}`}
            title={`${title}. Drop your chip here to bet on this side.`}
          >
            <FittedOneLineText fillParent text={title} basePx={12} minPx={8} />
          </h3>
          {poolTotal !== undefined && poolTotal >= 0 && (
            <div className="flex shrink-0 items-center justify-center gap-1.5">
              <span className={`hidden sm:block h-4 w-px shrink-0 rounded-full ${vBar}`} aria-hidden />
              <span
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-green-400/90 tabular-nums leading-none"
                title={`Total stake on this side: ${formatCurrency(poolTotal)}`}
              >
                <span className="inline-flex translate-y-px text-[10px] leading-none sm:text-[11px]" aria-hidden>
                  {COIN_SYMBOL}
                </span>
                <span className="leading-tight">{formatNumber(poolTotal)}</span>
              </span>
            </div>
          )}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-start overflow-x-hidden">
          <div className="flex flex-wrap content-start items-start gap-2 p-1">
            {sorted.map((p) => (
              <PlayerChip
                key={p.userId}
                userId={p.userId}
                username={p.username}
                amount={p.amount}
                insured={p.insured}
                isMe={p.userId === currentUserId}
                draggable={canDrag && p.userId === currentUserId}
                onSide
              />
            ))}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function UndecidedZone({
  board,
  currentUserId,
  canDrag,
  embeddedBelowTeamPick,
  alignWithWinnerStrip = false,
}: {
  board: BoardData;
  currentUserId: string | null;
  canDrag: boolean;
  /** Hide visible “Choose a side” label — redundant with MatchDetail team cards */
  embeddedBelowTeamPick?: boolean;
  /** Match settled with a winner — reserve top band so column aligns with team columns */
  alignWithWinnerStrip?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "drop-undecided" });
  const sortedUndecided = sortWithMeFirst(board.undecided, currentUserId);
  const winnerStripSpacer = (
    <div
      className="flex shrink-0 justify-center border-b border-transparent px-3 py-1"
      aria-hidden
    >
      <span className="invisible inline-flex rounded-full border border-transparent px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] leading-tight">
        Winner
      </span>
    </div>
  );
  return (
    <div
      ref={setNodeRef}
      className={`flex h-full min-h-[100px] min-w-0 flex-col overflow-hidden rounded-xl border-2 transition-colors ${
        isOver ? "border-rose-400 bg-rose-50 border-dashed" : "border-dashed border-slate-300 bg-slate-50"
      }`}
    >
      {alignWithWinnerStrip ? winnerStripSpacer : null}
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col px-3 pb-3 ${alignWithWinnerStrip ? "pt-2" : "pt-3"}`}
      >
      {embeddedBelowTeamPick ? (
        <>
          <h3 className="sr-only">Undecided — drag your chip to a team column</h3>
          <div
            className={`shrink-0 ${BETTING_COLUMN_HEADER_STRIP} border-dashed ${isOver ? "border-rose-200/80" : "border-slate-300/70"}`}
            aria-hidden
          />
        </>
      ) : (
        <div className={`shrink-0 ${BETTING_COLUMN_HEADER_STRIP} border-slate-200`}>
          <h3
            className="min-w-0 flex-1 text-xs font-semibold leading-tight text-slate-500"
            title="Drag your name here or use the buttons below to pick a team"
          >
            Choose a side
          </h3>
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-start overflow-x-hidden">
        <div className="flex flex-wrap content-start items-start gap-2 p-1">
          {sortedUndecided.map((p) => (
            <PlayerChip
              key={p.userId}
              userId={p.userId}
              username={p.username}
              isMe={p.userId === currentUserId}
              draggable={canDrag && p.userId === currentUserId}
              nameOnly
            />
          ))}
          {board.undecided.length === 0 && (
            <p className="text-slate-500 text-xs">Everyone has picked.</p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

type PlayerBettingBoardProps = {
  board: BoardData;
  currentUserId: string | null;
  stake: number; // stake from stake control; used when placing new bet from board
  onPlaceBet: (teamId: string, amount: number) => Promise<void>;
  onCancelBet?: () => Promise<void>;
  placing: boolean;
  isUpcoming: boolean;
  bettingOpen?: boolean;
  /** When false, user cannot place/change bet (e.g. insufficient balance) */
  canAffordBet?: boolean;
  /** When set (completed match), the winning team's column is highlighted */
  winnerTeamId?: string | null;
  /**
   * Mobile layout under “Choose your side”: hide redundant hint + duplicate bet buttons
   * (team cards + bottom sheet already handle pick / stake).
   */
  embeddedBelowTeamPick?: boolean;
};

export default function PlayerBettingBoard({
  board,
  currentUserId,
  stake,
  onPlaceBet,
  onCancelBet,
  placing,
  isUpcoming,
  bettingOpen,
  canAffordBet = true,
  winnerTeamId,
  embeddedBelowTeamPick = false,
}: PlayerBettingBoardProps) {
  const canBet = (bettingOpen !== undefined ? bettingOpen : isUpcoming) && canAffordBet;
  /* Touch: delay avoids fighting scroll + layout route-swipe; tolerance allows small finger jitter */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 12 } })
  );

  const homePoolTotal = board.onHome.reduce((s, p) => s + p.amount, 0);
  const awayPoolTotal = board.onAway.reduce((s, p) => s + p.amount, 0);
  const myStake =
    board.onHome.find((p) => p.userId === currentUserId)?.amount ??
    board.onAway.find((p) => p.userId === currentUserId)?.amount ??
    stake;
  const onHome = board.onHome.some((p) => p.userId === currentUserId);
  const onAway = board.onAway.some((p) => p.userId === currentUserId);
  const undecided = !onHome && !onAway;
  const canChange = canBet && !!currentUserId && !placing;

  async function handleDragEnd(event: DragEndEvent) {
    const { over } = event;
    if (!over || !currentUserId || placing) return;

    const overId = String(over.id);
    if (overId === "drop-undecided") {
      if (onCancelBet) await onCancelBet();
      return;
    }

    const teamId = overId === "drop-home" ? board.homeTeam.id : overId === "drop-away" ? board.awayTeam.id : null;
    if (!teamId) return;
    const currentOnHome = board.onHome.some((p) => p.userId === currentUserId);
    const currentOnAway = board.onAway.some((p) => p.userId === currentUserId);
    const alreadyOnThisSide =
      (teamId === board.homeTeam.id && currentOnHome) || (teamId === board.awayTeam.id && currentOnAway);
    if (alreadyOnThisSide) return;
    const amount = currentOnHome || currentOnAway ? myStake : stake;
    onPlaceBet(teamId, amount);
  }

  function handleDragStart() {
    document.body.style.cursor = "grabbing";
  }
  function handleDragEndOrCancel() {
    document.body.style.cursor = "";
  }

  return (
    <div className="space-y-3" data-prevent-route-swipe="true">
      <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 sm:px-4">
        <p className="text-[11px] sm:text-xs text-slate-600 leading-snug">
          <span className="font-semibold text-slate-800">Drag &amp; drop:</span>{" "}
          Long-press your chip (touch) or click-drag (mouse), then drop on{" "}
          <span className="font-medium text-slate-800">{board.homeTeam.shortName}</span> or{" "}
          <span className="font-medium text-slate-800">{board.awayTeam.shortName}</span> to bet or switch sides. Drop in the{" "}
          <span className="font-medium text-slate-800">middle</span> column to remove your bet before lock.
        </p>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={async (e) => {
          handleDragEndOrCancel();
          await handleDragEnd(e);
        }}
        onDragCancel={handleDragEndOrCancel}
      >
        <div className="overflow-x-auto min-w-0">
          <div className="grid min-h-0 grid-cols-3 gap-2 sm:gap-3 min-w-[300px] w-full items-stretch [&>div]:flex [&>div]:min-h-0 [&>div]:h-full [&>div]:min-w-0">
          <DroppableZone
            id="drop-home"
            title={board.homeTeam.shortName}
            poolTotal={homePoolTotal}
            players={board.onHome}
            currentUserId={currentUserId}
            canDrag={canChange}
            isWinner={winnerTeamId === board.homeTeam.id}
            alignWithWinnerStrip={winnerTeamId != null && winnerTeamId !== board.homeTeam.id}
          />
          <UndecidedZone
            board={board}
            currentUserId={currentUserId}
            canDrag={canChange}
            embeddedBelowTeamPick={embeddedBelowTeamPick}
            alignWithWinnerStrip={winnerTeamId != null}
          />
          <DroppableZone
            id="drop-away"
            title={board.awayTeam.shortName}
            poolTotal={awayPoolTotal}
            players={board.onAway}
            currentUserId={currentUserId}
            canDrag={canChange}
            isWinner={winnerTeamId === board.awayTeam.id}
            alignWithWinnerStrip={winnerTeamId != null && winnerTeamId !== board.awayTeam.id}
          />
          </div>
        </div>
      </DndContext>

      {canChange && !embeddedBelowTeamPick && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-xs text-slate-500 mb-2">
            Your pick — drag your name above, or tap a button below. You can remove your bet until lock time.
          </p>
          <div className="flex flex-wrap gap-2">
            {undecided ? (
              <>
                <button
                  type="button"
                  onClick={() => onPlaceBet(board.homeTeam.id, stake)}
                  disabled={placing}
                  className="min-h-[44px] min-w-[44px] px-4 py-3 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-500 active:bg-primary-500 disabled:opacity-50 [touch-action:manipulation]"
                >
                  Bet on {board.homeTeam.shortName} (<span key={stake} className="stake-value-transition">{formatCurrency(stake)}</span>)
                </button>
                <button
                  type="button"
                  onClick={() => onPlaceBet(board.awayTeam.id, stake)}
                  disabled={placing}
                  className="min-h-[44px] min-w-[44px] px-4 py-3 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-500 active:bg-primary-500 disabled:opacity-50 [touch-action:manipulation]"
                >
                  Bet on {board.awayTeam.shortName} (<span key={stake} className="stake-value-transition">{formatCurrency(stake)}</span>)
                </button>
                <button
                  type="button"
                  disabled
                  className="min-h-[44px] min-w-[44px] px-4 py-3 rounded-lg text-sm font-medium bg-slate-200 text-slate-500 cursor-not-allowed [touch-action:manipulation]"
                >
                  Remove Bet
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onPlaceBet(onHome ? board.awayTeam.id : board.homeTeam.id, myStake)}
                  disabled={placing}
                  className="min-h-[44px] min-w-[44px] px-4 py-3 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-500 active:bg-primary-500 disabled:opacity-50 [touch-action:manipulation]"
                  title="Change to the other team and keep the same stake"
                >
                  Switch to {onHome ? board.awayTeam.shortName : board.homeTeam.shortName}
                </button>
                <button
                  type="button"
                  onClick={async () => { await onCancelBet?.(); }}
                  disabled={placing}
                  className="min-h-[44px] min-w-[44px] px-4 py-3 rounded-lg text-sm font-medium bg-slate-200 text-slate-700 hover:bg-slate-300 active:bg-slate-300 disabled:opacity-50 [touch-action:manipulation]"
                  title="Remove your bet until lock time"
                >
                  Remove Bet on {onHome ? board.homeTeam.shortName : board.awayTeam.shortName} (<span key={myStake} className="stake-value-transition">{formatCurrency(myStake)}</span>)
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
