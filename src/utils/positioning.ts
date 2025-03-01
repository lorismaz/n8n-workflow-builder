/**
 * Default workflow node starting position
 */
export const DEFAULT_POSITION = { x: 100, y: 240 };

/**
 * Horizontal spacing between nodes
 */
export const NODE_HORIZONTAL_SPACING = 200;

/**
 * Vertical spacing for branching nodes
 */
export const NODE_VERTICAL_SPACING = 140;

/**
 * Calculate the next position for a node in a linear workflow
 * @param current The current position
 * @returns The next position to the right
 */
export function calculateNextPosition(current: { x: number; y: number }): { x: number; y: number } {
  return { x: current.x + NODE_HORIZONTAL_SPACING, y: current.y };
}

/**
 * Calculate positions for nodes in a parallel branch
 * @param basePosition Base position to branch from
 * @param branchIndex Index of the branch
 * @param totalBranches Total number of branches
 * @returns The position for this branch node
 */
export function calculateBranchPosition(
  basePosition: { x: number; y: number },
  branchIndex: number,
  totalBranches: number
): { x: number; y: number } {
  const centerBranchOffset = Math.floor(totalBranches / 2);
  const yOffset = (branchIndex - centerBranchOffset) * NODE_VERTICAL_SPACING;
  
  return {
    x: basePosition.x + NODE_HORIZONTAL_SPACING,
    y: basePosition.y + yOffset
  };
}
