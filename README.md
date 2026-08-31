# Level Up Bookmarklet for Dynamics 365 / Power Apps

A bookmarklet version of **Level Up for Dynamics 365 / Power Apps** for people who cannot or do not want to install the browser extension.

This bookmarklet is based directly on code from the original open-source Level Up project, with modifications and additional buttons/tools added by me.

<img width="402" height="919" alt="image" src="https://github.com/user-attachments/assets/223fb02a-557c-4414-b118-3340c2df6563" />


## Original Project

This project would not exist without **Level Up for Dynamics 365 / Power Apps** by **Rajyraman (@rajyraman)** and its contributors.

Original GitHub repository:

https://github.com/rajyraman/Levelup-for-Dynamics-CRM

Level Up is licensed under the **MIT License**.

This bookmarklet copies and adapts functionality from that project so it can run directly from a browser bookmark instead of requiring the Chrome/Edge/Firefox extension.

I have also added and modified functionality for my own Power Platform workflows.

## Why a Bookmarklet?

The original Level Up browser extension is the better option if you are allowed to install extensions.

This version is useful in environments where browser extensions are blocked, such as managed corporate or government computers.

A bookmarklet is simply JavaScript saved as a browser bookmark.

Open a Dynamics 365 or Power Apps model-driven app, click the bookmark, and the Level Up tools open against the current page.

## Installation

1. Create a new browser bookmark.
2. Name it something like `Level Up`.
3. Edit the bookmark.
4. Paste the complete bookmarklet code into the URL field.
5. Make sure the URL starts with `javascript:`.
6. Open a Dynamics 365 / Power Apps model-driven application.
7. Click the bookmark.

## Features

The bookmarklet includes many of the most useful Level Up developer and administrator tools.

### Form Tools

* Enable all fields
* Show hidden fields
* Disable field requirements
* Show logical/schema names
* Show schema names beside normal labels
* Show Choice/Option Set numeric values
* Inspect field values
* Find fields on the current form
* Highlight changed/dirty fields
* Clear form notifications
* Refresh the command bar/ribbon
* Refresh the form
* Toggle lookup links

### Record Tools

* Entity/table information
* Copy the current record ID
* Copy/open the current record URL
* Inspect record properties
* Clone records
* Open the current record through the Dataverse Web API

### Navigation

Quickly open:

* a record by ID
* a new record form
* the current form editor
* the Web API record
* Dynamics administration pages
* Power Apps Maker pages

### Developer Tools

Includes utilities for things such as:

* current user/environment information
* FetchXML
* metadata inspection
* table relationships
* form debugging
* command/ribbon debugging

## Additional Buttons

I have added additional buttons and functionality that are not part of the original bookmarklet/extension implementation.

These include Power Platform shortcuts and developer utilities that make it easier to jump directly between a running model-driven application and the relevant Maker Portal or administration pages.

The bookmarklet may continue to gain additional tools that are useful for Dynamics 365 and Power Platform development.

## Important

This is **not the official Level Up project** and is not maintained or endorsed by the original Level Up authors.

The original Level Up extension can be found here:

https://github.com/rajyraman/Levelup-for-Dynamics-CRM

If you can install browser extensions, I recommend checking out the original project as well.

## Security

This tool runs JavaScript inside the Dynamics 365 / Power Apps page you currently have open.

It does **not** bypass Dataverse security permissions.

For example, enabling a disabled field in the browser does not give you permission to update that field if Dataverse security prevents it.

Use developer/debugging actions carefully, especially in production environments.

## License / Attribution

Parts of this project are copied and adapted from **Level Up for Dynamics 365 / Power Apps**, which is distributed under the MIT License.

Original project:

https://github.com/rajyraman/Levelup-for-Dynamics-CRM

Copyright and license notices from the original project should be retained where required by the MIT License.

Credit belongs to **Rajyraman and the Level Up contributors** for the original project and functionality.
