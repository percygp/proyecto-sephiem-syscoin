import { internalMutation } from "../_generated/server";

export const approveAllSeedSpecialists = internalMutation({
  args: {},
  handler: async (ctx) => {
    const specialists = await ctx.db.query("marketplaceSpecialists").collect();
    let approved = 0;
    for (const s of specialists) {
      if (!s.isVerifiedByAdmin) {
        await ctx.db.patch("marketplaceSpecialists", s._id, {
          isVerifiedByAdmin: true,
          updatedAt: Date.now(),
        });
        approved++;
      }
    }
    return { approved };
  },
});
