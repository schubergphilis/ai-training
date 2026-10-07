# Cutting a release

1. Create the branch `release/vX.Y.Z` from an up-to-date `main`.
2. Run the full test suite.
3. Bump the version in `pyproject.toml`.
4. Add a section for the new version to `CHANGELOG.md`.
5. Commit with the message `release: vX.Y.Z` and open a pull request.
6. After the merge, tag the merge commit `vX.Y.Z` and push the tag.
7. Wait for the release job to publish the package.
8. Send a test invoice from staging to the team inbox.
9. Post the changelog section in the team channel.
