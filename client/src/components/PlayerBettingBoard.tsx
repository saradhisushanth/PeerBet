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
import { formatCurrency } from "../utils/format";

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
}: {
  userId: string;
  username: string;
  amount?: number;
  insured?: boolean;
  isMe: boolean;
  draggable?: boolean;
  onSide?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `player-${userId}`,
    data: { userId, username, amount: amount ?? 0 },
    disabled: !draggable,
  });

  const displayLabel =
    amount != null
      ? isMe
        ? `${username} (you) — ${formatCurrency(amount)}`
        : `${username} — ${formatCurrency(amount)}`
      : isMe
        ? `${username} (you)`
        : username;

  if (!draggable) {
    return (
      <span className={`px-2.5 py-1 rounded-lg text-sm inline-block ${isMe ? "bg-primary-500/30 text-primary-300 ring-1 ring-primary-400/60" : "bg-gray-700/80 text-gray-200"}`}>
        {displayLabel}
        {insured && <span className="ml-1.5 text-amber-400" title="Insured — get refund if you lose">🛡</span>}
      </span>
    );
  }
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-draggable-chip
      title={onSide ? "Drag to change team or use buttons below" : "Drag to a team or use buttons below"}
      className={`inline-block px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-sm select-none cursor-grab active:cursor-grabbing ${
        isDragging ? "bg-primary-500/80 shadow-lg z-50 opacity-90 cursor-grabbing" : isMe ? "bg-primary-500/80 text-white ring-2 ring-primary-400/80 hover:bg-primary-500 active:bg-primary-500" : "bg-primary-600/60 text-white hover:bg-primary-500/80 active:bg-primary-500"
      }`}
      style={{ touchAction: "none", cursor: "grab", pointerEvents: "auto" }}
    >
      <span style={{ pointerEvents: "none" }} className="flex items-center gap-1.5">
        {displayLabel}
        {insured && isMe && <span className="text-amber-300" title="Insured">🛡</span>}
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
}: {
  id: string;
  title: string;
  poolTotal?: number;
  players: { userId: string; username: string; amount: number; insured?: boolean }[];
  currentUserId: string | null;
  canDrag: boolean;
  className?: string;
  isWinner?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const sorted = sortWithMeFirst(players, currentUserId);
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 min-h-[100px] p-3 transition-colors ${
        isWinner ? "border-green-500/80 bg-green-500/10" : isOver ? "border-primary-500 bg-primary-500/10" : "border-gray-700 bg-gray-800/50"
      } ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 mb-2">
        <h3 className={`text-xs font-semibold ${isWinner ? "text-green-400" : "text-gray-400"}`} title={`Drop your chip here to bet on ${title}`}>
          {title}{isWinner && " — WINNER"}
        </h3>
        {poolTotal !== undefined && poolTotal >= 0 && (
          <span className="text-xs font-medium text-green-400/90" title="Total stake on this side">
            {formatCurrency(poolTotal)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
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
  );
}

function UndecidedZone({
  board,
  currentUserId,
  canDrag,
}: {
  board: BoardData;
  currentUserId: string | null;
  canDrag: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "drop-undecided" });
  const sortedUndecided = sortWithMeFirst(board.undecided, currentUserId);
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 min-h-[100px] p-3 transition-colors ${
        isOver ? "border-primary-500 bg-primary-500/10 border-dashed" : "border-dashed border-gray-700 bg-gray-800/30"
      }`}
    >
      <h3 className="text-xs font-semibold text-gray-400 mb-2" title="Drag your name here or use the buttons below to pick a team">Choose a side</h3>
      <div className="flex flex-wrap gap-2">
        {sortedUndecided.map((p) => (
          <PlayerChip
            key={p.userId}
            userId={p.userId}
            username={p.username}
            isMe={p.userId === currentUserId}
            draggable={canDrag && p.userId === currentUserId}
          />
        ))}
        {board.undecided.length === 0 && (
          <p className="text-gray-500 text-xs">Everyone has picked.</p>
        )}
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
}: PlayerBettingBoardProps) {
  const canBet = (bettingOpen !== undefined ? bettingOpen : isUpcoming) && canAffordBet;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 50, tolerance: 8 } })
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
    <div className="space-y-4">
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
        <div className="overflow-x-auto">
          <div className="grid grid-cols-3 gap-2 sm:gap-4 min-w-[300px] w-full">
          <DroppableZone
            id="drop-home"
            title={`${board.homeTeam.shortName} SUPPORT`}
            poolTotal={homePoolTotal}
            players={board.onHome}
            currentUserId={currentUserId}
            canDrag={canChange}
            isWinner={winnerTeamId === board.homeTeam.id}
          />
          <UndecidedZone board={board} currentUserId={currentUserId} canDrag={canChange} />
          <DroppableZone
            id="drop-away"
            title={`${board.awayTeam.shortName} SUPPORT`}
            poolTotal={awayPoolTotal}
            players={board.onAway}
            currentUserId={currentUserId}
            canDrag={canChange}
            isWinner={winnerTeamId === board.awayTeam.id}
          />
          </div>
        </div>
      </DndContext>

      {canChange && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-3">
          <p className="text-xs text-gray-400 mb-2">
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
                  className="min-h-[44px] min-w-[44px] px-4 py-3 rounded-lg text-sm font-medium bg-gray-600/60 text-gray-500 cursor-not-allowed [touch-action:manipulation]"
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
                  className="min-h-[44px] min-w-[44px] px-4 py-3 rounded-lg text-sm font-medium bg-gray-600 text-gray-200 hover:bg-gray-500 active:bg-gray-500 disabled:opacity-50 [touch-action:manipulation]"
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
