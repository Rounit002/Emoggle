"use client";
import type { ReactNode } from "react";
import { UserProfileProvider } from "../context/UserProfileContext";
import { PlayerNameProvider } from "../context/PlayerNameContext";
import { CountryProvider } from "../context/CountryContext";
import { SupportPromptProvider } from "../context/SupportPromptContext";
export default function ExperienceProviders({ children, privateGame = false }: {
    children: ReactNode;
    privateGame?: boolean;
}) {
    return <UserProfileProvider><PlayerNameProvider><CountryProvider><SupportPromptProvider privateGame={privateGame}>{children}</SupportPromptProvider></CountryProvider></PlayerNameProvider></UserProfileProvider>;
}
