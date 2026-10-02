# Which machines the deploy and test-launch scripts talk to.
#
# Copy this file to deploy-targets.local.psd1 (same folder) and fill in your own values.
# The .local copy is git-ignored, so the Google accounts in it never reach the public repo.
# The scripts refuse to run while any value below still reads "you@example.com" or "YOUR-".
#
# Used by: deploy-test.ps1, deploy-production.ps1, launch-game-test-server.ps1
# (all through scripts/deploy-common.ps1).
#
# Keep the test machine's Vm and Project DIFFERENT from production's. The scripts check this:
# if a test command ever runs against the wrong project, a different machine name makes it fail
# with "not found" instead of succeeding against the live server.
# See docs/Deployment.md -> "Know which project you are aimed at".

@{
    test = @{
        Vm      = 'bsf-guide-test'
        Zone    = 'us-central1-a'
        Project = 'YOUR-TEST-PROJECT'
        Account = 'you@example.com'
        # Where the server's checkout lives on the machine.
        RepoDir = '~/BSF-Custom-Server/bsf-server'
        # Leave empty for a machine with no name or certificate: the scripts look up its
        # current address (it changes on every restart) and use plain http://.
        Url     = ''
    }
    production = @{
        Vm      = 'bsf-server-vm'
        Zone    = 'us-central1-a'
        Project = 'YOUR-PRODUCTION-PROJECT'
        Account = 'you@example.com'
        RepoDir = '~/BSF-Custom-Server/bsf-server'
        Url     = 'https://bsf-server.duckdns.org/'
    }
}
