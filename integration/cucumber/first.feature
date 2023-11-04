Feature: test cucumber
  Background:
    Given I visit site

  Scenario: 01 visiting the frontpage
    Then I should see a search bar "hello"

  Scenario: 02 visiting the frontpage
    Then I should see a search bar "hello"

  Scenario Outline: 03 visiting the frontpage
    Then I should see a search bar "<text>"
    Examples:
    | text  |
    | hello |
    | bye   |

  @P1
  @failOnPurpose
  Scenario: 04 visiting the frontpage
    Then This step should fail