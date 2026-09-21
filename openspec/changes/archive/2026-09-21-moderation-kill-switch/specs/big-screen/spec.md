## ADDED Requirements

### Requirement: The big screen blanks while the kill switch is active

The big screen SHALL show a full blanking overlay whenever the kill switch is active, in place of whatever view the display directive would otherwise show, and SHALL resume that view exactly once the kill switch is cleared.

#### Scenario: The screen blanks when the kill switch activates

- **WHEN** the kill switch becomes active while the screen is showing any view
- **THEN** the screen shows the blanking overlay instead

#### Scenario: The screen resumes its prior view when the kill switch clears

- **WHEN** the kill switch is cleared after being active
- **THEN** the screen resumes showing whatever view the display directive currently indicates
