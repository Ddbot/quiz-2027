## ADDED Requirements

### Requirement: Waiting-screen media is admin-writable, publicly readable, and stripped of identifying metadata

The system SHALL provide a Storage location for an event's optional waiting-screen media (image only — see the `event-authoring` capability for the video-deferral decision). Only an admin identity SHALL be able to upload or replace media in that location. Any uploaded file SHALL have EXIF and other embedded metadata stripped before it is stored. Once stored, the media SHALL be readable without authentication, matching the public-summary posture the `onboarding` capability already gives the rest of an event's non-administrative details.

#### Scenario: Non-admin upload is denied

- **WHEN** a non-admin identity attempts to upload a file to the waiting-screen media location
- **THEN** the upload is denied

#### Scenario: Admin upload succeeds

- **WHEN** an admin identity uploads an image or short video to the waiting-screen media location
- **THEN** the upload succeeds and the file is stored

#### Scenario: Uploaded media has no embedded metadata

- **WHEN** a file carrying EXIF or other embedded metadata is uploaded to the waiting-screen media location
- **THEN** the stored file no longer carries that metadata

#### Scenario: Stored media is readable without authentication

- **WHEN** a request with no session reads a stored waiting-screen media file by its reference
- **THEN** the file is returned
