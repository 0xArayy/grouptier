import { generateSetupCard, generateVotingCard, generateWinnerCard } from './imageCard.js';

interface TaskInput {
  task: 'setup' | 'voting' | 'winner';
  args: unknown[];
}

export default async function run(input: TaskInput): Promise<Buffer> {
  const { task, args } = input;
  switch (task) {
    case 'setup':
      return generateSetupCard();
    case 'voting':
      return generateVotingCard(args[0] as string, args[1] as number);
    case 'winner':
      return generateWinnerCard(args[0] as string, args[1] as string);
    default:
      throw new Error(`Unknown task: ${String(task)}`);
  }
}
