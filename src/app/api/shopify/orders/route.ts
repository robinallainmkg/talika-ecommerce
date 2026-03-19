import { NextResponse } from "next/server"
import { getOrders, getOrdersByDiscountCode } from "@/lib/integrations/shopify"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const discountCode = searchParams.get("discount_code")

    if (discountCode) {
      const data = await getOrdersByDiscountCode(discountCode)
      return NextResponse.json(data)
    }

    const data = await getOrders({
      status: searchParams.get("status") || "any",
      created_at_min: searchParams.get("from") || undefined,
      created_at_max: searchParams.get("to") || undefined,
      limit: Number(searchParams.get("limit")) || 50,
    })
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch orders" },
      { status: 500 }
    )
  }
}
