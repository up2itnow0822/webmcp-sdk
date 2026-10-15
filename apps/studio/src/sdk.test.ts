import { it, expect } from "vitest";
import { registerStudio } from "./sdk";
import { Studio } from "./domain";
import { PracticeGateway } from "./practice";
it("agent tools only read and propose; never sign or accept calldata", async () => {
  const g = new PracticeGateway();
  let sends = 0;
  g.send = async () => {
    sends++;
    throw Error("Forbidden signing");
  };
  const s = new Studio(g, undefined, true);
  await s.connect();
  const kit = registerStudio(s);
  try {
    await kit.ready();
    expect(
      kit
        .getTools()
        .map((t) => t.name)
        .sort(),
    ).toEqual(["studio.studio_propose", "studio.studio_state"]);
    const request = {
      kind: "transfer",
      asset: "USDC",
      amount: "1",
      recipient: "0x2222222222222222222222222222222222222222",
    };
    expect(await kit.invoke("studio.studio_propose", request)).toMatchObject({
      status: "proposed",
    });
    await expect(kit.invoke("studio.execute", { id: "P-1" })).rejects.toThrow();
    await expect(
      kit.invoke("studio.studio_propose", { ...request, data: "0x1234" }),
    ).rejects.toThrow();
    expect(sends).toBe(0);
  } finally {
    kit.unregisterAll();
  }
});
