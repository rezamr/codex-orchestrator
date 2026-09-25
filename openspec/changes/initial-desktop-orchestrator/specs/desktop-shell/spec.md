# Delta for Desktop Shell

## Purpose

Define the secure desktop application boundary so normal operation is graphical while privileged local capabilities remain isolated from renderer content.

## ADDED Requirements

### Requirement: GUI-first desktop operation
The system SHALL provide a desktop graphical interface for normal project, job, session, automation, and settings workflows without requiring the user to open a command prompt.

#### Scenario: User starts a job
- **WHEN** a user opens the installed application and creates a job
- **THEN** the user can select a project, configure the job, and start it entirely through the GUI

### Requirement: Privileged process isolation
The system MUST isolate filesystem, process, database, provider, verification, notification, and power capabilities from direct renderer access.

#### Scenario: Renderer requests a privileged operation
- **WHEN** the renderer requests an allowed privileged operation
- **THEN** the request passes through a narrow typed preload/IPC contract
- **AND** the main process validates the request before executing it

### Requirement: Controlled external navigation
The system MUST prevent arbitrary renderer navigation or new-window content from inheriting privileged application capabilities.

#### Scenario: User activates an external link
- **WHEN** the user activates an approved external URL
- **THEN** the application opens it through a controlled external-link handler
- **AND** the remote page does not receive the privileged preload bridge
