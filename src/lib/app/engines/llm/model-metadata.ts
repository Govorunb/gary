import z from "zod";

export const zModelMetadata = z.strictObject({
    contextWindow: z.number().int().positive(),
});

export const zModelMetadataOverrides = z.record(z.string(), zModelMetadata);

export type ModelMetadata = z.infer<typeof zModelMetadata>;
export type ModelMetadataOverrides = z.infer<typeof zModelMetadataOverrides>;

export function modelMetadataOverride(
    overrides: ModelMetadataOverrides | undefined,
    model: string,
): ModelMetadata | undefined {
    return overrides?.[model];
}
