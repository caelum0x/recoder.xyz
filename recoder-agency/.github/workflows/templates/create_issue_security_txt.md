## Summary

This issue reminds you to update your `security.txt` file to comply with the latest standards and maintain its relevance.

🔗 [RFC 9116: A File Format to Aid in Security Vulnerability Disclosure](https://www.rfc-editor.org/rfc/rfc9116)

> The "Expires" field indicates the date and time after which the data contained in the "security.txt" file is considered stale and should not be used (as per Section 5.3). (snip) It is RECOMMENDED that the value of this field be less than a year into the future to avoid staleness.

## What to do

Please create a pull request to address the following tasks:

* Update the `Expires` field in `security.txt` to a date less than a year in the future
* Review and update any other fields in the file to ensure they remain accurate and relevant
