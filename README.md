# Event-Q&A

This program is a simple event accompagnying tool which shows
the different tracks, gives informations about them,
and allows the users to participate with questions.
To configure it, the admin creates a yaml file with all
the information about an event, and then launches the
tool on a server.
The participants can connect using any name they wish,
ask questions, answer or discuss existing questions,
and write DMs.

There is a short technical writeup in 
[TECHNICAL.md](./TECHNICAL.md).

## Configuration

The admin creates a yaml file, event.yaml, which gives the
following information:

- event duration, place, additional information
- the rooms available with a short name, and a fuller
description
- the list of speakers with their name, short bio
- a list of admin accounts with alias/password
- the availble tracks, and for each track a list of
  - talks with start date, duration, speaker(s), track and room

# User flow

## Login

When a user first connects to the website, it asks the user
about their alias, and optionally their name, affiliation, and bio.
This information is stored on the server, and the alias is stored
in the localStorage of the browser.
The alias cannot be one of the alias of the admin accounts.
-> Landing page
If the user comes to the login page, and there is an alias stored
in the localStorage, it is used to login -> Landing page

## Landing page

Once the user is logged in, they see the program of the day
in a responsive way - bigger for a desktop browser, less information
on a mobile system.
The user can click on a talk to see more information -> Talk page.
The user can also click on the "users" icon to see an alphabetic list
of all available users -> Users list

## Talk page

On the talk page, the user sees already available questions, and can:
- upvote a question
- add a message to a question, or reply to an already existing message
- click on the author of the question -> User info

## Users list

Shows an alphabetic list of users with their alias, and some of the
optional information they added.
For each user it also shows a count of questions, messages, and
last interaction with the system.
When click on a user, it goes to -> User info

## User info

Shows details about the user wrt their info, their questions, and
their public messages.
Also allows to start a DM -> Direct Messages

## Direct Messages

A very simple chat where two users can discuss and exchange
information.

# General Layout

The webpage should follow the general layout and be as
easy navigatable as possible.
In the upper right, the user sees their icon, can click
on it to edit their information, including their alias.
The user can also log out, which will delete the alias
name from the localStorage.
