"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CustomerInfo,
  ErrorCode,
  Offering,
  Purchases,
  PurchasesError,
} from "@revenuecat/purchases-js";
import { useUserProfile } from "./UserProfileContext";

const REVENUECAT_API_KEY =
  process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY?.trim() ?? "";
const REVENUECAT_ENTITLEMENT_ID =
  process.env.NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim() || "vip";

function hasEntitlement(customerInfo: CustomerInfo | null): boolean {
  return Boolean(
    customerInfo?.entitlements.active[REVENUECAT_ENTITLEMENT_ID],
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "RevenueCat could not complete the request. Please try again.";
}

interface RevenueCatContextValue {
  isAvailable: boolean;
  isLoading: boolean;
  isPurchasing: boolean;
  isVIP: boolean;
  entitlementId: string;
  offering: Offering | null;
  customerInfo: CustomerInfo | null;
  error: string | null;
  showPaywall: () => Promise<boolean>;
  refreshCustomerInfo: () => Promise<boolean>;
  manageSubscription: () => void;
}

const RevenueCatContext = createContext<RevenueCatContextValue | null>(null);

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const { profile } = useUserProfile();
  const purchasesRef = useRef<Purchases | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(REVENUECAT_API_KEY));
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering, setOffering] = useState<Offering | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // RevenueCat identity must match the server-authenticated user so webhook
    // entitlement updates cannot be redirected with a browser-chosen ID.
    const appUserId = profile?.userId;
    if (!REVENUECAT_API_KEY || !appUserId) {
      return;
    }
    const resolvedAppUserId = appUserId;

    let cancelled = false;

    async function initializeRevenueCat() {
      try {
        const purchases = Purchases.isConfigured()
          ? Purchases.getSharedInstance()
          : Purchases.configure({
              apiKey: REVENUECAT_API_KEY,
              appUserId: resolvedAppUserId,
            });

        purchasesRef.current = purchases;
        void purchases.preload();

        const [nextCustomerInfo, offerings] = await Promise.all([
          purchases.getCustomerInfo(),
          purchases.getOfferings(),
        ]);

        if (cancelled) return;
        setCustomerInfo(nextCustomerInfo);
        setOffering(offerings.current);
        setError(null);
      } catch (initializationError) {
        if (!cancelled) setError(getErrorMessage(initializationError));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void initializeRevenueCat();

    return () => {
      cancelled = true;
    };
  }, [profile?.userId]);

  const refreshCustomerInfo = useCallback(async () => {
    const purchases = purchasesRef.current;
    if (!purchases) {
      setError(
        REVENUECAT_API_KEY
          ? "RevenueCat is still starting. Please try again."
          : "VIP billing is not configured yet.",
      );
      return false;
    }

    setIsLoading(true);
    try {
      const nextCustomerInfo = await purchases.getCustomerInfo();
      setCustomerInfo(nextCustomerInfo);
      setError(null);
      return hasEntitlement(nextCustomerInfo);
    } catch (refreshError) {
      setError(getErrorMessage(refreshError));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const manageSubscription = useCallback(() => {
    if (!customerInfo?.managementURL) {
      setError("No active web subscription is available to manage.");
      return;
    }

    window.open(customerInfo.managementURL, "_blank", "noopener,noreferrer");
  }, [customerInfo]);

  const showPaywall = useCallback(async () => {
    const purchases = purchasesRef.current;
    if (!purchases) {
      setError(
        REVENUECAT_API_KEY
          ? "RevenueCat is still starting. Please try again."
          : "VIP billing is not configured yet.",
      );
      return false;
    }

    setIsPurchasing(true);
    setError(null);

    try {
      const result =
        offering?.hasPaywall === true
          ? await purchases.presentPaywall({
              offering,
              onBack: (closePaywall) => closePaywall(),
              onVisitCustomerCenter: manageSubscription,
              listener: {
                onPurchaseError: (purchaseError) => {
                  setError(getErrorMessage(purchaseError));
                },
              },
            })
          : offering?.availablePackages[0]
            ? await purchases.purchase({
                rcPackage: offering.availablePackages[0],
              })
            : null;

      if (!result) {
        setError(
          "No RevenueCat package is available. Publish a current offering in the RevenueCat dashboard.",
        );
        return false;
      }

      setCustomerInfo(result.customerInfo);
      return hasEntitlement(result.customerInfo);
    } catch (purchaseError) {
      if (
        purchaseError instanceof PurchasesError &&
        purchaseError.errorCode === ErrorCode.UserCancelledError
      ) {
        return false;
      }

      setError(getErrorMessage(purchaseError));
      return false;
    } finally {
      setIsPurchasing(false);
    }
  }, [manageSubscription, offering]);

  const value = useMemo<RevenueCatContextValue>(
    () => ({
      isAvailable: Boolean(REVENUECAT_API_KEY),
      isLoading,
      isPurchasing,
      isVIP: hasEntitlement(customerInfo),
      entitlementId: REVENUECAT_ENTITLEMENT_ID,
      offering,
      customerInfo,
      error,
      showPaywall,
      refreshCustomerInfo,
      manageSubscription,
    }),
    [
      customerInfo,
      error,
      isLoading,
      isPurchasing,
      manageSubscription,
      offering,
      refreshCustomerInfo,
      showPaywall,
    ],
  );

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);
  if (!context) {
    throw new Error("useRevenueCat must be used inside RevenueCatProvider");
  }
  return context;
}
