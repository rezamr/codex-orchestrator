# Delta for Security Boundaries

## Purpose

Define the desktop security boundaries required because the application can access local source files, launch processes, verify commands, and request system power operations.

## ADDED Requirements

### Requirement: Hardened renderer

The system MUST run renderer content without direct Node.js privilege and with context isolation enabled.

#### Scenario: Renderer code attempts direct Node access

- **WHEN** renderer code runs in a normal application window
- **THEN** direct Node.js APIs are unavailable except through the allowlisted preload contract

### Requirement: Validated IPC

The system MUST validate privileged IPC requests in the main process.

#### Scenario: Malformed IPC payload is sent

- **WHEN** the renderer sends a payload that does not satisfy the expected request schema
- **THEN** the request is rejected without executing the privileged operation

### Requirement: Safe process invocation

The system MUST avoid unsafe concatenation of untrusted values into privileged shell commands.

#### Scenario: Project path contains shell metacharacters

- **WHEN** a project path includes characters meaningful to a shell
- **THEN** process execution treats the path as an argument/value rather than executable shell syntax wherever shell use is not explicitly required

### Requirement: Sensitive logging redaction

The system MUST redact authentication secrets and other configured sensitive fields from application logs and diagnostic exports.

#### Scenario: Provider error contains an authorization value

- **WHEN** a provider error payload includes a recognized secret field
- **THEN** stored/displayed diagnostic logs omit or redact the secret value
