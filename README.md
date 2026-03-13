# Nurdle

A daily number-guessing game inspired by Wordle. Instead of words, you guess a 3-digit number with all unique digits. After each guess, colored feedback dots tell you how many digits are correct, misplaced, or absent -- but not which ones.

Play it here: [https://anirudh-gonnuri.github.io/nurdle](https://anirudhgonnuri.github.io/nurdle)

## How to Play

- The secret is a 3-digit number with no repeated digits.
- You have 6 attempts to guess the number.
- After each guess, feedback dots appear:
  - Green: A digit is correct and in the right position.
  - Yellow: A digit exists but in the wrong position.
  - Gray: A digit is not in the number.
- The dots are not mapped to specific positions, so you must use logic to narrow down the answer.
- Long-press any key on the keypad to cross it out as scratch work.

## Modes

- **Daily** -- A new puzzle every day at midnight, the same for all players. Stats and streaks are tracked.
- **Practice** -- Unlimited random puzzles.
- **Battle** -- Real-time multiplayer. Create or join a room, pick a secret number for your opponent, and take turns guessing. First to solve wins.

## License

MIT
