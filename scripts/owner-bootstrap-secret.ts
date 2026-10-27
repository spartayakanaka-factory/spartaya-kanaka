export type OwnerBootstrapEnvironment = Record<string, string | undefined>;

export function consumeOwnerBootstrapPassword(
  environment: OwnerBootstrapEnvironment,
  args: readonly string[],
  interactive: boolean,
) {
  const password = environment.OWNER_BOOTSTRAP_PASSWORD;
  const confirmation = environment.OWNER_BOOTSTRAP_PASSWORD_CONFIRM;
  const provided = password !== undefined || confirmation !== undefined;

  delete environment.OWNER_BOOTSTRAP_PASSWORD;
  delete environment.OWNER_BOOTSTRAP_PASSWORD_CONFIRM;

  if (!provided) {
    if (!interactive) {
      throw new Error(
        "Set the one-time owner password and confirmation in the private environment for a non-interactive run.",
      );
    }
    return null;
  }

  if (
    environment.DATABASE_TARGET !== "hostinger-phase2-test" ||
    environment.APP_ENV !== "staging" ||
    environment.STAGING_SITE !== "1" ||
    !args.includes("--confirm-hostinger-phase2-test")
  ) {
    throw new Error(
      "Environment-based owner provisioning requires explicit confirmation of the Hostinger Phase 2 staging target.",
    );
  }

  if (!password || !confirmation || password !== confirmation) {
    throw new Error("The one-time owner password and confirmation must both be set and match.");
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error("The owner password must be between 12 and 128 characters.");
  }

  return password;
}
