## ADDED Requirements

### Requirement: Once a step is revealed, the player sees their own result

When a player's private result for a step arrives, their client SHALL replace that step's holding view with a view showing whether their answer was correct and how many points they earned, without showing the correct option, other players' answers, or rankings.

#### Scenario: A correct answer shows the points earned

- **WHEN** a player's own result for a step indicates a correct answer
- **THEN** their client shows that the answer was correct along with the points earned

#### Scenario: An incorrect or missing answer shows no points

- **WHEN** a player's own result for a step indicates an incorrect answer, or that they did not submit one
- **THEN** their client shows that no points were earned for that step, without indicating what the correct answer was
