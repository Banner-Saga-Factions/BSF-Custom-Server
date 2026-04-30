# --- Configuration ---
$STACK_OCID = "ocid1.ormstack.oc1.us-chicago-1.amaaaaaawb5hpzqaks4lvjonvaozogxezicfo32nc4trnjkuhgp2v2fqv5ra"

Write-Host "Attempting to provision BSF Server via OCI Stack..." -ForegroundColor Cyan

# This command creates a new 'Apply' job for your stack.
# --execution-plan-strategy AUTO_APPROVED allows it to run without a separate 'Plan' job.
oci resource-manager job create-apply-job `
    --stack-id $STACK_OCID `
    --execution-plan-strategy AUTO_APPROVED `
    --display-name "Automated-Retry-$(Get-Date -Format 'yyyyMMdd-HHmm')"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Apply job submitted successfully. Check OCI Console for physical capacity result." -ForegroundColor Green
} else {
    Write-Host "Failed to submit job. Check OCI CLI configuration." -ForegroundColor Red
}