---
name: preview-test
description: Prove a pull request end to end on a preview or staging environment before merge. The skill deploys the PR branch and makes one test account for each role that the feature needs. It runs the flow of each role, checks the effects across roles, and then removes everything that it added. Use it when a PR must run on a preview deploy before merge. Also use it when a feature needs several accounts that act on each other, for example sender and receiver, or inviter and invitee. Use it when someone asks for a preview test, a staging test or an end-to-end proof of a PR.
---

# Preview test

This skill proves one PR end to end before merge. The PR runs in a preview environment. Each role that the feature needs gets its own test account. Each test account does its part of the flow, and the evidence shows each part. At the end, you remove everything that you added.

For a GO or NO-GO pass on a release, use the `release-test` skill.

## Terms

- **Preview environment:** a test copy of the service that runs the PR branch. Examples are a branch deploy, a preview app or a staging environment. It is never production.
- **Role:** one part in the feature, for example the sender or the receiver.
- **Test account:** an account that you make for one role in one run.
- **Run id:** a short label for one pass, for example `pr-123-a`. Put it in the name and the email of each test account.
- **Evidence:** the screenshots, screen videos, logs and request IDs that show each result.

## Safety rules

- Never send a request to production.
- Never use a production account, production data or a production key.
- Never copy a production key to the preview environment. For each third-party service, use a test project.
- Never send a message to a real user. Disable outbound email, SMS and push, or send them to a test inbox.
- Use reserved domains for test emails: `example.com`, `example.org`, `example.net` or a name under `.invalid` (RFC 2606). An example is `qa+pr-123-a-sender@example.invalid`.
- For test phone numbers, use the test numbers of your SMS provider.
- Keep secrets out of logs and evidence. Make sure that no screenshot or video shows a token.
- Pass tokens through environment variables or header files, not through command arguments. Other processes on the host can read command arguments.
- Keep tokens in a file with mode 0600. Delete the file at the end.
- Never change a feature flag for all users. Target the test accounts only.
- Never merge, approve or queue the PR. The owner does that.

## Steps

### 1. List the gates

Read the PR diff and the feature code. Record each gate that the feature passes:

- The feature flags and their target rules.
- The configuration rows and the admin routes that change them.
- The environment variables that each service reads.
- Each rule that a test account must meet: eligibility, the order of events and one-time limits.

To compare a secret between two environments, compare a short hash of each value. Never print the value.

### 2. Deploy the PR branch

1. Use the preview or branch-deploy feature of your host.
2. Deploy the head commit of the PR.
3. If the preview environment is shared, examine which PR it runs now.
4. If a different PR uses the preview environment, tell its author before you deploy.
5. If the PR changes only a client, deploy a backend to the preview environment too.

### 3. Wait for health

1. Wait until the health endpoint of each service returns a success code.
2. For each service, read the commit of the deployment that serves traffic. Use the host's deploy list.
3. Make sure that each commit is the head commit of the PR.

Do not use a version endpoint or a green deploy status as proof. A preview build can show an unknown version. A host can also skip the build of a service when its watched paths did not change.

After each change to an environment variable, do step 3 again. Some hosts deploy the default branch again after a variable change, not the PR.

### 4. Make the test accounts

1. Make one test account for each role.
2. Put the run id in the name and the email of each test account.
3. Make each test account at the time that its rule allows.
4. Give each test account a different first name.
5. Make each test account through the service that it uses later.
6. For each retry of a one-time action, make new test accounts.

These notes explain the steps:

- An account made before an event can fail a rule that counts from that event.
- With different names, the UI shows "Ana, Ben, and Cy", not "Test, Test, and Test".
- Some systems tie the identity of an account to the service that made it.
- A one-time limit refuses a test account that did the action before.

If a feature needs only a link between two test accounts, make the link through the API. This saves UI steps that the feature does not change.

### 5. Set the feature flags

1. Target each flag at the test accounts only. Use their account IDs or a property that only they have.
2. Record the old value of each configuration row that you change. Step 10 needs it.
3. Change each configuration row through its admin route.
4. Wait until the caches expire.
5. Read each value again to make sure that it applies.

### 6. Run the flow of each role

1. Start a screen video for each test account.
2. Do the first action as the first role.
3. Do the response as each other role.
4. Show the result on the first test account.
5. Record the evidence: the screenshots, the logs and the request ID of each call.

The video must show each side, not only the first test account.

For a mobile client, these notes apply:

- Build the client against the preview environment. Make sure that its base URL names the preview environment.
- Give the token to the app through a launch argument or a secure store, not through the screen keyboard.
- Use one device at a time.
- A device install keeps one push token. The token belongs to the test account that used the install last.
- Some apps read a one-time value, for example an invite on the clipboard, only one time for each install. Install the app again before the next test account.
- A simulator can copy the host clipboard into the device. Set the two clipboards to the same value. Compare them before you open the app.
- If no push banner comes, record the entry in the notification center.

To show a push to one test account, do these steps:

1. Open the app as that test account.
2. Put the app in the background.
3. Send the action from the other test account through the API.

### 7. Check the results

Check each item:

- The main path for each role.
- The effects across roles: what each test account sees after the other test account acts.
- One case for each rule that refuses an action.
- The database rows. Use read-only queries only. For Postgres, set `PGOPTIONS='-c default_transaction_read_only=on'`.
- The state in each third-party service.
- The latency of the main read: 20 calls, with p50 and p95.

### 8. Fix and run again

1. Open one issue and one PR for each defect.
2. Push the fix to the PR, or deploy the fix PR to the preview environment.
3. Do steps 3 to 7 again with new test accounts.

### 9. Keep the evidence

1. Put the results and the evidence links in the PR description.
2. Save the evidence before you remove the preview environment. The host can delete the logs of a removed deploy.

### 10. Remove what you added

Do these steps in this order. Delete the test accounts before you remove the deploy, because the delete call needs the deploy.

1. Set each configuration row back to its old value.
2. Remove the test accounts from the target of each feature flag.
3. Delete or disable each test account. Use the same service that made it.
4. Delete the test records in third-party services, for example analytics persons and payment customers.
5. Remove each temporary key from the preview environment.
6. Remove the deploy.
7. If the preview environment is shared, tell the author of the next PR that it runs.
8. Stop each device and simulator that you started.
9. Delete the local token file.

## Common mistakes

| Mistake                                               | Result                                       | Do instead                                             |
| ----------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Trust a version endpoint or a green deploy status     | The service runs old code or no code         | Read the commit of each deployment that serves traffic |
| Change a variable after the deploy, and do no check   | The host runs the default branch, not the PR | Do step 3 again after each variable change             |
| Make all test accounts at the start                   | Accounts made before an event do not count   | Make each test account after the event its rule needs  |
| Use a test account again for a retry                  | A one-time limit refuses it                  | Make new test accounts                                 |
| Give each test account the same name                  | The UI shows "Test, Test, and Test"          | Give each test account a different first name          |
| Change a flag rule for all users                      | Real users see the feature                   | Target the flag at the test accounts only              |
| Copy a production key to the preview environment      | Test writes go to production                 | Use a test project for each third-party service        |
| Record only the first test account                    | Nobody sees the other side work              | Record the side of each role                           |
| Remove the deploy before you delete the test accounts | No service can delete them                   | Delete the test accounts first                         |
