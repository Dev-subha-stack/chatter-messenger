export function getMessageContextMenuPosition({
  anchorX,
  anchorY,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  gap = 8,
}) {
  const safeWidth = Math.max(0, Number(menuWidth) || 0);
  const safeHeight = Math.max(0, Number(menuHeight) || 0);
  const width = Math.max(0, Number(viewportWidth) || 0);
  const height = Math.max(0, Number(viewportHeight) || 0);
  const x = Math.max(gap, Math.min(Number(anchorX) || 0, width - safeWidth - gap));
  const below = (Number(anchorY) || 0) + 6;
  const above = (Number(anchorY) || 0) - safeHeight - 8;
  const y = below + safeHeight <= height - gap
    ? below
    : Math.max(gap, Math.min(above, height - safeHeight - gap));
  return { x, y };
}
